import jwt

from datetime import datetime, timedelta, timezone
from django.conf import settings
from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed
from apps.settings.models import Setting
from apps.users.models import User, UserDeactivationLog


DEFAULT_ACCESS_TOKEN_DURATION_MINUTES = 30


def get_access_token_duration_minutes() -> int:
    setting = Setting.objects.filter(key="session_ttl_minutes").first()
    if not setting:
        return DEFAULT_ACCESS_TOKEN_DURATION_MINUTES

    try:
        duration_minutes = int(setting.value)
    except (TypeError, ValueError):
        return DEFAULT_ACCESS_TOKEN_DURATION_MINUTES

    return duration_minutes if duration_minutes > 0 else DEFAULT_ACCESS_TOKEN_DURATION_MINUTES


def create_access_token(user, duration_minutes: int | None = None):
    token_duration_minutes = duration_minutes or get_access_token_duration_minutes()
    payload = {
        "user_id": str(user.id),
        "exp": datetime.now(timezone.utc) + timedelta(minutes=token_duration_minutes),
    }

    return jwt.encode(
        payload,
        settings.JWT_SECRET_KEY,
        algorithm="HS256",
    )

class CustomJWTAuthentication(BaseAuthentication):

    def authenticate(self, request):

        header = request.headers.get("Authorization")

        if not header:
            return None

        if not header.startswith("Bearer "):
            raise AuthenticationFailed(
                "Invalid authorization header"
            )

        token = header[7:]

        try:
            payload = jwt.decode(
                token,
                settings.JWT_SECRET_KEY,
                algorithms=["HS256"],
            )

        except jwt.ExpiredSignatureError:
            raise AuthenticationFailed("Token expired")

        except jwt.InvalidTokenError:
            raise AuthenticationFailed("Invalid token")

        user_id = payload.get("user_id")

        if user_id is None:
            raise AuthenticationFailed(
                "Invalid token"
            )

        try:
            user = User.objects.get(
                id=user_id,
            )
            
            if(UserDeactivationLog.objects.filter(user=user).exists()):
                raise AuthenticationFailed("User is deactivated")

        except User.DoesNotExist:
            raise AuthenticationFailed(
                "User not found"
            )

        return (user, token)