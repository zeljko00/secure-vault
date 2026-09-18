import base64
import hashlib
import hmac
import json
import os
import struct
import time
import uuid
from urllib.parse import quote, urlencode

from util.redis_client import get_redis_client

MFA_ISSUER = "SecureVault"
MFA_TIME_STEP_SECONDS = 30
MFA_CODE_LENGTH = 6
MFA_CHALLENGE_TTL_SECONDS = 10 * 60
MFA_REDIS_PREFIX = "mfa:challenge:"


def generate_totp_secret_bytes() -> bytes:
    return os.urandom(20)


def encode_totp_secret(secret_bytes: bytes) -> str:
    return base64.b32encode(secret_bytes).decode("ascii").rstrip("=")


def decode_totp_secret(secret_base32: str) -> bytes:
    padding = "=" * ((8 - len(secret_base32) % 8) % 8)
    return base64.b32decode((secret_base32 + padding).encode("ascii"), casefold=True)


def _hotp_code(secret_bytes: bytes, counter: int) -> str:
    counter_bytes = struct.pack(">Q", counter)
    digest = hmac.new(secret_bytes, counter_bytes, hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    code_int = struct.unpack(">I", digest[offset : offset + 4])[0] & 0x7FFFFFFF
    code_int %= 10 ** MFA_CODE_LENGTH
    return f"{code_int:0{MFA_CODE_LENGTH}d}"


def build_totp_provisioning_uri(secret_bytes: bytes, account_name: str, issuer: str = MFA_ISSUER) -> str:
    secret_base32 = encode_totp_secret(secret_bytes)
    label = f"{quote(issuer)}:{quote(account_name)}" if issuer else quote(account_name)
    parameters = urlencode(
        {
            "secret": secret_base32,
            "issuer": issuer,
            "algorithm": "SHA1",
            "digits": MFA_CODE_LENGTH,
            "period": MFA_TIME_STEP_SECONDS,
        }
    )
    return f"otpauth://totp/{label}?{parameters}"


def verify_totp_code(secret_base32: str, code: str, timestamp: int | None = None, drift_steps: int = 1) -> bool:
    normalized_code = code.strip().replace(" ", "")
    if not normalized_code.isdigit() or len(normalized_code) != MFA_CODE_LENGTH:
        return False

    secret_bytes = decode_totp_secret(secret_base32)
    current_timestamp = int(time.time()) if timestamp is None else int(timestamp)
    current_counter = current_timestamp // MFA_TIME_STEP_SECONDS

    for step_offset in range(-drift_steps, drift_steps + 1):
        if _hotp_code(secret_bytes, current_counter + step_offset) == normalized_code:
            return True

    return False


def generate_totp_code(secret_base32: str, timestamp: int | None = None) -> str:
    secret_bytes = decode_totp_secret(secret_base32)
    current_timestamp = int(time.time()) if timestamp is None else int(timestamp)
    counter = current_timestamp // MFA_TIME_STEP_SECONDS
    return _hotp_code(secret_bytes, counter)


def create_mfa_challenge(payload: dict[str, str], ttl_seconds: int = MFA_CHALLENGE_TTL_SECONDS) -> str:
    challenge_id = str(uuid.uuid4())
    redis_client = get_redis_client()
    redis_client.setex(f"{MFA_REDIS_PREFIX}{challenge_id}", ttl_seconds, json.dumps(payload))
    return challenge_id


def get_mfa_challenge(challenge_id: str) -> dict[str, str] | None:
    redis_client = get_redis_client()
    payload = redis_client.get(f"{MFA_REDIS_PREFIX}{challenge_id}")
    if not payload:
        return None

    return json.loads(str(payload))


def delete_mfa_challenge(challenge_id: str) -> None:
    get_redis_client().delete(f"{MFA_REDIS_PREFIX}{challenge_id}")
