import os
from functools import lru_cache

import redis


@lru_cache(maxsize=1)
def get_redis_client() -> redis.Redis:
    redis_url = os.getenv('REDIS_URL')
    return redis.Redis.from_url(redis_url, decode_responses=True)