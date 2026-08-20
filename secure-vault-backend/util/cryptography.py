import hashlib

def sha256(data: bytes) -> str:
    """Compute the SHA-256 hash of the given data."""
    return hashlib.sha256(data).hexdigest()