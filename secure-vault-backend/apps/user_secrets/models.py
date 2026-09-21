import hashlib
import json
import uuid

from django.db import models, transaction
from django.utils import timezone

class SecretType(models.TextChoices):
    PASSWORD = "password", "Password"
    API_KEY = "api_key", "API Key"
    CERTIFICATE = "certificate", "Certificate"
    OTHER = "other", "Other"

class Secret(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    type = models.CharField(blank=False, choices=SecretType.choices, default=SecretType.OTHER, max_length=20)
    label = models.CharField(blank=False, null=False, max_length=100)
    value = models.BinaryField(blank=False, null=False)
    iv = models.CharField(blank=True, null=True, max_length=256)
    marker = models.CharField(blank=True, null=True, max_length=256)

    owner = models.ForeignKey('users.User', on_delete=models.CASCADE, related_name="secrets")

    def __str__(self):
        return self.label
    
class SharedSecret(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    secret = models.ForeignKey(Secret, on_delete=models.CASCADE, related_name="shared_instances")
    sharing_with = models.ForeignKey('users.User', on_delete=models.CASCADE, related_name="received_secrets")
    sharing_expires_at = models.DateTimeField(blank=True, null=True)
    sharing_revoked = models.BooleanField(default=False)

    def __str__(self):
        return f"{self.secret.owner.username} is sharing {self.secret.label} with {self.sharing_with.username}"

class AuditLedgerState(models.Model):
    id = models.PositiveSmallIntegerField(primary_key=True, default=1, editable=False)
    last_block_index = models.PositiveBigIntegerField(default=0)
    last_block_hash = models.CharField(max_length=64, blank=True, default="")
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "audit ledger state"
        verbose_name_plural = "audit ledger state"

class AuditLog(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    
    secret_id = models.UUIDField(null=True, blank=True)
    secret_type = models.CharField(max_length=20, blank=True, null=True)
    secret_label = models.CharField(max_length=100, blank=True, null=True)
    is_shared_secret = models.BooleanField(default=False)
    is_honeypot_secret = models.BooleanField(default=False)
    owner_id = models.UUIDField(blank=True, null=True)
    owner_username = models.CharField(max_length=150, blank=True, null=True)
    
    user_id = models.UUIDField(blank=True, null=True)
    user_username = models.CharField(max_length=150, blank=True, null=True)
    timestamp = models.DateTimeField(default=timezone.now, editable=False)
    ip_address = models.GenericIPAddressField(blank=True, null=True)
    details = models.TextField(blank=True, null=True)
    
    action = models.CharField(max_length=64)
    block_index = models.PositiveBigIntegerField(unique=True, db_index=True)
    previous_hash = models.CharField(max_length=64)
    block_hash = models.CharField(max_length=64, unique=True, db_index=True)
    payload = models.CharField(max_length=2048, blank=True, null=True)

    def save(self, *args, **kwargs):
        if not self._state.adding and not kwargs.get("force_insert", False):
            raise ValueError("Audit log entries are immutable.")
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValueError("Audit log entries are immutable.")

    @classmethod
    def record_event(
        cls,
        *,
        action: str,
        secret=None,
        is_shared_secret: bool = False,
        is_honeypot_secret: bool = False,
        user=None,
        ip_address=None,
        details: str | None = None,
        payload: str | None = None,
    ):
        event_payload = payload or ""

        with transaction.atomic():
            ledger_state, _ = AuditLedgerState.objects.select_for_update().get_or_create(pk=1)
            block_index = ledger_state.last_block_index + 1
            previous_hash = ledger_state.last_block_hash or "0" * 64
            timestamp = timezone.now()

            hash_payload = {
                "action": action,
                "secret_id": str(secret.id) if secret else None,
                "secret_label": secret.label if secret else None,
                "secret_type": secret.type if secret else None,
                "is_shared_secret": is_shared_secret,
                "is_honeypot_secret": is_honeypot_secret,
                "owner_id": str(secret.owner.id) if secret and secret.owner else None,
                "owner_username": secret.owner.username if secret and secret.owner else None,
                "user_id": str(user.id) if user else None,
                "user_username": user.username if user else None,
                "timestamp": timestamp.isoformat(),
                "details": details or "",
                "ip_address": ip_address or "",
                "block_index": block_index,
                "previous_hash": previous_hash,
                "payload": event_payload,
            }
            block_hash = hashlib.sha256(
                json.dumps(hash_payload, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode("utf-8")
            ).hexdigest()

            log_entry = cls.objects.create(
                action=action,
                secret_id=secret.id if secret else None,
                secret_label=secret.label if secret else None,
                secret_type=secret.type if secret else None,
                is_shared_secret=is_shared_secret,
                is_honeypot_secret=is_honeypot_secret,
                owner_id=secret.owner.id if secret and secret.owner else None,
                owner_username=secret.owner.username if secret and secret.owner else None,
                user_id=user.id if user else None,
                user_username=user.username if user else None,
                timestamp=timestamp,
                ip_address=ip_address,
                details=details,
                block_index=block_index,
                previous_hash=previous_hash,
                payload=event_payload,
                block_hash=block_hash,
            )

            ledger_state.last_block_index = block_index
            ledger_state.last_block_hash = block_hash
            ledger_state.save(update_fields=["last_block_index", "last_block_hash", "updated_at"])
            return log_entry