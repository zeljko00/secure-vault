import jwt
import uuid
import secrets

from datetime import datetime, timedelta, timezone
from django.conf import settings
from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed
from apps.settings.models import Setting
from apps.users.models import User, UserDeactivationLog

DEFAULT_ACCESS_TOKEN_DURATION_MINUTES = 1
DEFAULT_REFRESH_TOKEN_DURATION_MINUTES = 60 * 24 * 7  # 7 days


def get_access_token_duration_minutes() -> int:
    setting = Setting.objects.filter(key="jwt_ttl_minutes").first()
    if not setting:
        return DEFAULT_ACCESS_TOKEN_DURATION_MINUTES

    try:
        duration_minutes = int(setting.value)
    except (TypeError, ValueError):
        return DEFAULT_ACCESS_TOKEN_DURATION_MINUTES

    return duration_minutes if duration_minutes > 0 else DEFAULT_ACCESS_TOKEN_DURATION_MINUTES

def get_refresh_token_duration_minutes() -> int:
    setting = Setting.objects.filter(key="session_ttl_minutes").first()
    if not setting:
        return DEFAULT_REFRESH_TOKEN_DURATION_MINUTES

    try:
        duration_minutes = int(setting.value)
    except (TypeError, ValueError):
        return DEFAULT_REFRESH_TOKEN_DURATION_MINUTES

    return duration_minutes if duration_minutes > 0 else DEFAULT_REFRESH_TOKEN_DURATION_MINUTES


def create_access_token(user_id):
    payload = {
        "user_id": str(user_id),
        "exp": datetime.now(timezone.utc) + timedelta(minutes=get_access_token_duration_minutes()),
        "jti": str(uuid.uuid4()),
    }
    
    print("Issued access token expires at:", payload["exp"].isoformat())
    print("=====================================================")

    return jwt.encode(
        payload,
        settings.JWT_SECRET_KEY,
        algorithm="HS256",
    )
    
def create_refresh_token():
    payload = {
        "token": secrets.token_urlsafe(64),
        "created_at": datetime.now(timezone.utc),
        "expires_at": datetime.now(timezone.utc) + timedelta(minutes=get_refresh_token_duration_minutes()),
    }
    print("Issued refresh token expires at:", payload["expires_at"].isoformat())
    print("=====================================================")
    

    return payload

class CustomJWTAuthentication(BaseAuthentication):

    def authenticate(self, request):

        # Try to get token from HttpOnly cookie
        token = request.COOKIES.get("access_token")
        
        if not token:
            return None

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