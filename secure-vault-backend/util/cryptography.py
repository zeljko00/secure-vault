import hashlib
from django.contrib.auth.hashers import Argon2PasswordHasher

def sha256(data: bytes) -> str:
    """Compute the SHA-256 hash of the given data."""
    return hashlib.sha256(data).hexdigest()

class CustomArgon2PasswordHasher(Argon2PasswordHasher):
    time_cost = 50
    memory_cost = 65536  # 64 MB
    parallelism = 2