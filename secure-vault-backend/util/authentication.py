import jwt
import uuid
import secrets
import base64
import binascii

from datetime import datetime, timedelta, timezone
from django.conf import settings
from rest_framework.authentication import BaseAuthentication, get_authorization_header
from rest_framework.exceptions import AuthenticationFailed
from apps.settings.models import Setting
from apps.users.models import User, UserDeactivationLog
from util.cryptography import CustomArgon2PasswordHasher

DEFAULT_ACCESS_TOKEN_DURATION_MINUTES = 1
DEFAULT_REFRESH_TOKEN_DURATION_MINUTES = 60 * 24 * 7  # 7 days


def get_request_device_id(request):
    device_id = request.headers.get("X-Device-Id")
    if not device_id:
        device_id = request.META.get("HTTP_X_DEVICE_ID")

    if not device_id:
        raise AuthenticationFailed("Invalid device id")

    return device_id


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


def create_access_token(user_id, device_id):
    payload = {
        "user_id": str(user_id),
        "device_id": str(device_id),
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
        token_device_id = payload.get("device_id")
        request_device_id = request.headers.get("X-Device-Id") or request.META.get("HTTP_X_DEVICE_ID")

        if user_id is None:
            raise AuthenticationFailed(
                "Invalid token"
            )

        if not token_device_id or not request_device_id or token_device_id != request_device_id:
            raise AuthenticationFailed("Invalid device id")

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


class UserBasicAuthentication(BaseAuthentication):

    def authenticate(self, request):
        auth = get_authorization_header(request).split()
        if not auth:
            return None

        if auth[0].lower() != b"basic":
            return None

        if len(auth) != 2:
            raise AuthenticationFailed("Invalid basic authentication header")

        try:
            decoded = base64.b64decode(auth[1]).decode("utf-8")
        except (binascii.Error, UnicodeDecodeError) as exc:
            raise AuthenticationFailed("Invalid basic authentication header") from exc

        username, separator, password = decoded.partition(":")
        if not separator:
            raise AuthenticationFailed("Invalid basic authentication header")

        user = User.objects.filter(username=username).first()
        if not user or UserDeactivationLog.objects.filter(user=user).exists():
            raise AuthenticationFailed("Invalid username or password")

        hasher = CustomArgon2PasswordHasher()
        try:
            hasher.verify(password, user.password_hash)
        except Exception as exc:
            raise AuthenticationFailed("Invalid username or password") from exc

        return (user, None)