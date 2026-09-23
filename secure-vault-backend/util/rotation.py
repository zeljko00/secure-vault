"""Secret rotation utility for mandatory rotation policy."""

from datetime import timedelta
from django.utils import timezone
from django.core.mail import send_mail
from django.conf import settings
from apps.user_secrets.models import Secret
from apps.settings.models import Setting

def is_secret_expired(secret: Secret) -> bool:
    duration = Setting.objects.filter(key="secret_rotation_days").first()
    if not duration:
        raise ValueError("Secret rotation duration setting not found.")

    return secret.last_rotated_at + timezone.timedelta(minutes=int(duration.value)) < timezone.now()

def get_rotation_expiration_date(secret: Secret) -> timezone.datetime:
    """Get the rotation expiration date for a secret."""
    duration = Setting.objects.filter(key="secret_rotation_days").first()
    if not duration:
        raise ValueError("Secret rotation duration setting not found.")

    return secret.last_rotated_at + timezone.timedelta(minutes=int(duration.value))