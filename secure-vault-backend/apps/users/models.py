from django.db import models
import uuid
from django.utils import timezone

class UserRole(models.TextChoices):
    ADMIN = "admin", "Admin"
    DEVELOPER = "dev", "Developer"
    TEAM_LEAD = "tl", "Team Lead"


class Team(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(unique=True, blank=False, null=False, max_length=100)
    description = models.TextField(blank=True, null=True)

    def __str__(self):
        return self.name


class User(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    username = models.CharField(unique=True, blank=False, null=False, max_length=150)
    role = models.CharField(
        blank=False, choices=UserRole.choices, default=UserRole.DEVELOPER, max_length=20
    )
    email = models.EmailField(unique=True, blank=False, null=False)
    password_hash = models.CharField(blank=False, null=False, max_length=128)
    pub_key = models.TextField(blank=False, null=False)
    mfa_setup_pending = models.BooleanField(default=False)
    mfa_secret = models.TextField(blank=True, null=True)
    join_timestamp = models.DateTimeField(
        auto_now_add=True, editable=False, blank=False, null=False
    )

    teams = models.ManyToManyField(Team, related_name="users", blank=True)

    @property
    def is_authenticated(self) -> bool:
        """DRF compatibility — User objects are always authenticated when present."""
        return True

    def __str__(self):
        return self.username


class UserDeactivationLog(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.OneToOneField(
        User, on_delete=models.CASCADE, related_name="deactivation_log"
    )
    timestamp = models.DateTimeField(auto_now_add=True, editable=False, blank=False)
    reason = models.TextField(blank=True, null=True, max_length=500)

class RefreshToken(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.OneToOneField(
        User, on_delete=models.CASCADE, related_name="token"
    )
    hash = models.CharField(unique=True, blank=False, null=False, max_length=255)
    created_at = models.DateTimeField(blank=False)
    expires_at = models.DateTimeField(blank=False, null=False)
    revoked = models.BooleanField(default=False)
