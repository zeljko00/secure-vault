from django.db.models import Q
from django.core.mail import send_mail
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.db import transaction
import secrets as random_secrets
import copy
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from redis.exceptions import RedisError
from django.db import connection
from django.db import models
from util.rotation import get_rotation_expiration_date


from apps.user_secrets.models import Secret, SecretType, SharedSecret, AuditLog
from apps.user_secrets.serializers import (
    SecretSerializer,
    OwnedSharedSecretSerializer,
    SharedSecretSerializer,
    ReceivedSharedSecretSerializer,
    SecretAuditLogSerializer,
)
from apps.users.models import RefreshToken, User, UserDeactivationLog
from apps.settings.models import Setting
from util.redis_client import get_redis_client
from util.request import get_client_ip
from django.contrib.auth.hashers import Argon2PasswordHasher
from util.authentication import UserBasicAuthentication

from util.authorization import CanManageSecrets, IsAdmin, CanManageSecret, CanShareSecret, CanManageSharedSecret, CanManageSharedSecrets, CanManageReceivedSecrets
from util.rotation import is_secret_expired

def build_audit_payload(*, secret: Secret, user: User, is_shared: bool, is_honeypot: bool, details: str) -> dict:
    # Deep copy the secret to preserve it even after deletion from DB
    secret_copy = copy.deepcopy(secret)
    
    payload = {
        "actor": user,
        "secret": secret_copy,
        "is_shared": is_shared,
        "is_honeypot": is_honeypot,
        "details": details,
    }
    return payload

def is_honeypot(secret, user: User, request) -> bool:
    ip_address = get_client_ip(request)
    argon2 = Argon2PasswordHasher()
    try:
        argon2.verify("honeypot", secret.marker)
        print("==========================================")
        print(f"Honeypot secret accessed by user ({user}).")
        print("==========================================")

        request._request.audit = build_audit_payload(
            secret=secret,
            user=user,
            is_shared=False,
            is_honeypot=True,
            details="Accessed honeypot secret!",
        )
        if not UserDeactivationLog.objects.filter(user=user).exists():
            UserDeactivationLog.objects.create(
                user=user,
                reason="Accessed honeypot secret",
            )
            RefreshToken.objects.filter(user=user).update(revoked=True)

        admin_emails = list(
            User.objects.filter(role="admin")
            .exclude(email__isnull=True)
            .exclude(email__exact="")
            .values_list("email", flat=True)
            .distinct()
        )

        if admin_emails:
            access_time = timezone.localtime(timezone.now()).strftime("%Y-%m-%d %H:%M:%S %Z")
            subject = f"[SecureVault] Honeypot accessed: {secret.label}"
            message = (
                "A honeypot secret was accessed.\n\n"
                f"Secret ID: {secret.id}\n"
                f"Secret label: {secret.label}\n"
                f"Accessed by: {user.username} ({user.id})\n"
                f"IP address: {ip_address or 'Unknown'}\n"
                f"Time: {access_time}\n"
                f"Endpoint: {request.path}\n"
            )

            send_mail(
                subject=subject,
                message=message,
                from_email=None,
                recipient_list=admin_emails,
                fail_silently=True,
            )
        
        return True
    except ValueError:
        return False


def generate_honeypot_secret_data() -> dict[str, str]:
    secret_type = random_secrets.choice([
        type[0] for type in SecretType.choices
    ])

    label_prefix = {
        SecretType.PASSWORD: "root-password",
        SecretType.API_KEY: "service-api-key",
        SecretType.CERTIFICATE: "internal-certificate",
        SecretType.OTHER: "private-note",
    }[secret_type]

    return {
        "type": secret_type,
        "label": f"{label_prefix}-{random_secrets.token_hex(4)}",
        "value": random_secrets.token_urlsafe(48),
        "marker": "honeypot",
        "iv": random_secrets.token_hex(8),
    }

class MySecretsView(APIView):
    permission_classes = [IsAuthenticated, CanManageSecrets]

    def get(self, request):
        secrets = Secret.objects.filter(owner=request.user)
        for secret in secrets:
            if is_secret_expired(secret):
                secret.value = models.BinaryField(blank=False, null=False).to_python(b"")  # Clear the value for expired secrets
        serializer = SecretSerializer(secrets, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)


class SecretAuditLogsView(APIView):
    permission_classes = [IsAuthenticated, IsAdmin]

    def get(self, request):
        # Convert string query param to boolean: "true" -> True, "false" -> False
        is_honeypot = request.query_params.get("is_honeypot", "false").lower() == "true"
        
        access_logs = (
            AuditLog.objects.filter(is_honeypot_secret=is_honeypot)
            .order_by("-block_index")
        )
        serializer = SecretAuditLogSerializer(access_logs, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)


class SecretsView(APIView):
    permission_classes = [IsAuthenticated, CanManageSecrets]

    def post(self, request):
        serializer = SecretSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save(owner=request.user)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class SecretView(APIView):
    permission_classes = [IsAuthenticated, CanManageSecret]

    def put(self, request, id):
        secret = get_object_or_404(Secret, id=id)
        
        request._request.audit = build_audit_payload(
            secret=secret,
            user=request.user,
            is_shared=False,
            is_honeypot=False,
            details="Updating secret!",
        )
        
        self.check_object_permissions(request, secret)
        serializer = SecretSerializer(secret, data=request.data, partial=True)
        if serializer.is_valid():
            # Check if content has changed, and if so, update last_rotated_at
            if request.query_params.get("is_rotation", "false").lower() == "true" and serializer.validated_data.get("value") is not None and serializer.validated_data.get("value") != secret.value:
                secret.last_rotated_at = timezone.now()
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    def delete(self, request, id):
        secret = get_object_or_404(Secret, id=id)
        request._request.audit = build_audit_payload(
            secret=secret,
            user=request.user,
            is_shared=False,
            is_honeypot=False,
            details="Deleting secret!",
        )
        self.check_object_permissions(request, secret)
        secret.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class PublicSecretView(APIView):
    authentication_classes = [UserBasicAuthentication]
    permission_classes = [IsAuthenticated]
    
    def get(self, request, user_id, secret_id):
        # Check if endpoint is enabled
        enabled = Setting.objects.filter(key="hidden_endpoint_enabled").first()
        if not enabled or enabled.value != "true":
            return Response(status=status.HTTP_404_NOT_FOUND)

        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT id FROM user_secrets_secret WHERE (owner_id = '"
                + user_id +"') AND id = '" + secret_id + "'",
            )
            row = cursor.fetchone()

        if not row:
            return Response(status=status.HTTP_404_NOT_FOUND)
        secret = get_object_or_404(Secret, id=row[0])
        
        # Log honeypot access if marked
        is_honeypot(secret, request.user, request)
        
        serializer = SecretSerializer(secret)
        return Response(serializer.data, status=status.HTTP_200_OK)

class HoneypotView(APIView):
    permission_classes = [IsAuthenticated, IsAdmin]

    def post(self, request):
        # Check if endpoint is enabled
        enabled = Setting.objects.filter(key="hidden_endpoint_enabled").first()
        if not enabled or enabled.value != "true":
            return Response(status=status.HTTP_404_NOT_FOUND)

        data = generate_honeypot_secret_data()
        serializer = SecretSerializer(data=data)
        serializer.is_valid(raise_exception=True)
        secret = serializer.save(owner=request.user)
        
        return Response(SecretSerializer(secret).data, status=status.HTTP_201_CREATED)
    
class ShareSecretView(APIView):
    permission_classes = [IsAuthenticated, CanShareSecret]

    def post(self, request, id):
        secret = get_object_or_404(Secret, id=id)
        self.check_object_permissions(request, secret)
        
        secret_ciphertext = request.data.get("cipher_text")

        serializer = SharedSecretSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        if not secret_ciphertext:
            return Response(
                {"detail": "cipher_text is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        sharing_expires_at = serializer.validated_data.get("sharing_expires_at")
        if sharing_expires_at is None or sharing_expires_at > get_rotation_expiration_date(secret):
            return Response(
                {"detail": "sharing_expires_at cannot exceed secret's rotation expiration date."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        shared = serializer.save(secret=secret)

        try:
            redis_client = get_redis_client()
            ttl_seconds = (
                int((shared.sharing_expires_at - timezone.now()).total_seconds())
                if shared.sharing_expires_at
                else None
            )

            if ttl_seconds:
                redis_client.set(str(shared.id), secret_ciphertext, ex=ttl_seconds)
            else:
                redis_client.set(str(shared.id), secret_ciphertext)

            return Response(serializer.data, status=status.HTTP_201_CREATED)
        except (RedisError, ValueError):
            shared.delete()
            return Response(
                {"detail": "Failed to store shared secret."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
            
    def get(self, request, id):
        secret = get_object_or_404(Secret, id=id)
        self.check_object_permissions(request, secret)
        
        shared_instances = SharedSecret.objects.filter(secret=secret, sharing_revoked=False).filter(
            Q(sharing_expires_at__isnull=True) | Q(sharing_expires_at__gt=timezone.now())
        )
        
        return Response(
            {
                "shared_instances": [
                    {
                        "id": instance.id,
                        "recipient_id": instance.sharing_with.id,
                        "recipient_pub_key": instance.sharing_with.pub_key,
                    }
                    for instance in shared_instances
                ],
            },
            status=status.HTTP_200_OK,
        )

class SharedSecretView(APIView):
    permission_classes = [IsAuthenticated, CanManageSharedSecret]

    def get(self, request, id):
        shared = get_object_or_404(
            SharedSecret, id=id
        )
        request._request.audit = build_audit_payload(
            secret=shared.secret,
            user=request.user,
            is_shared=True,
            is_honeypot=False,
            details="Accessing shared secret!",
        )
        self.check_object_permissions(request, shared)
        

        if shared.sharing_revoked:
            return Response(status=status.HTTP_404_NOT_FOUND)

        if shared.sharing_expires_at and shared.sharing_expires_at <= timezone.now():
            return Response(
                {"detail": "Shared secret expired or unavailable."},
                status=status.HTTP_410_GONE,
            )

        redis_client = get_redis_client()
        payload = redis_client.get(str(shared.id))
        if not payload:
            return Response(
                {"detail": "Shared secret expired or unavailable."},
                status=status.HTTP_410_GONE,
            )

        if isinstance(payload, bytes):
            payload = payload.decode("utf-8")

        response_data = dict(SharedSecretSerializer(shared).data)
        response_data["cipher_text"] = payload
        return Response(response_data, status=status.HTTP_200_OK)

    def put(self, request, id):
        shared = get_object_or_404(SharedSecret, id=id)
        request._request.audit = build_audit_payload(
            secret=shared.secret,
            user=request.user,
            is_shared=True,
            is_honeypot=False,
            details="Updating shared secret!",
        )
        self.check_object_permissions(request, shared)

        payload = request.data.get("cipher_text")
        if not payload:
            return Response(
                {"detail": "cipher_text is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if shared.sharing_revoked:
            return Response(status=status.HTTP_404_NOT_FOUND)

        if shared.sharing_expires_at and shared.sharing_expires_at <= timezone.now():
            return Response(
                {"detail": "Shared secret expired or unavailable."},
                status=status.HTTP_410_GONE,
            )

        redis_client = get_redis_client()

        try:
            ttl_seconds = (
                int((shared.sharing_expires_at - timezone.now()).total_seconds())
                if shared.sharing_expires_at
                else None
            )

            if ttl_seconds is not None and ttl_seconds <= 0:
                return Response(
                    {"detail": "Shared secret expired or unavailable."},
                    status=status.HTTP_410_GONE,
                )

            if ttl_seconds:
                updated = redis_client.set(str(shared.id), payload, ex=ttl_seconds, xx=True)
            else:
                updated = redis_client.set(str(shared.id), payload, xx=True)

            if not updated:
                return Response(
                    {"detail": "Shared secret expired or unavailable."},
                    status=status.HTTP_410_GONE,
                )

            response_data = dict(SharedSecretSerializer(shared).data)
            response_data["cipher_text"] = payload
            return Response(response_data, status=status.HTTP_200_OK)
        except (RedisError, ValueError):
            return Response(
                {"detail": "Failed to update shared secret."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

    def delete(self, request, id):
        shared = get_object_or_404(SharedSecret, id=id)
        request._request.audit = build_audit_payload(
            secret=shared.secret,
            user=request.user,
            is_shared=True,
            is_honeypot=False,
            details="Deleting shared secret!",
        )
        self.check_object_permissions(request, shared)
        shared.sharing_revoked = True
        shared.save()
        get_redis_client().delete(str(shared.id))
        return Response(status=status.HTTP_204_NO_CONTENT)

class MySharedSecretsView(APIView):
    permission_classes = [IsAuthenticated, CanManageSharedSecrets]

    def get(self, request):

        shared_queryset_1 = (
            SharedSecret.objects
            .filter(secret__owner=request.user, sharing_revoked=False, sharing_expires_at__gt=timezone.now())
            .select_related("secret", "sharing_with")
            .order_by("secret__label", "sharing_with__username")
        )
        shared_queryset_2 = (
            SharedSecret.objects
            .filter(secret__owner=request.user, sharing_revoked=False, sharing_expires_at__isnull=True)
            .select_related("secret", "sharing_with")
            .order_by("secret__label", "sharing_with__username")
        )
        serializer = OwnedSharedSecretSerializer(list(shared_queryset_1) + list(shared_queryset_2), many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)


class MyReceivedSecretsView(APIView):
    permission_classes = [IsAuthenticated, CanManageReceivedSecrets]

    def get(self, request):
        shared_queryset = (
            SharedSecret.objects.filter(
                sharing_with=request.user,
                sharing_revoked=False,
            )
            .filter(Q(sharing_expires_at__isnull=True) | Q(sharing_expires_at__gt=timezone.now()))
            .order_by("secret__owner__username", "secret__label")
        )
        serializer = ReceivedSharedSecretSerializer(shared_queryset, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)


class AuditLogIntegrityCheckView(APIView):
    permission_classes = [IsAuthenticated, IsAdmin]

    def get(self, request):
        result = AuditLog.verify_blockchain_integrity()
        return Response(result, status=status.HTTP_200_OK)
