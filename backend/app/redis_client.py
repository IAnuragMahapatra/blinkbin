import json
from redis.asyncio import Redis
from app.config import REDIS_URL

_redis: Redis | None = None


def get_redis() -> Redis:
    global _redis
    if _redis is None:
        _redis = Redis.from_url(REDIS_URL, decode_responses=True)
    return _redis


async def close_redis() -> None:
    global _redis
    if _redis:
        await _redis.aclose()
        _redis = None


def _key(paste_id: str) -> str:
    return f"paste:{paste_id}"


async def store_paste(paste_id: str, data: dict, ttl: int | None = None) -> None:
    r = get_redis()
    payload = json.dumps(data)
    if ttl:
        await r.setex(_key(paste_id), ttl, payload)
    else:
        await r.set(_key(paste_id), payload)


async def get_paste(paste_id: str) -> dict | None:
    r = get_redis()
    raw = await r.get(_key(paste_id))
    return json.loads(raw) if raw else None


async def get_and_delete_paste(paste_id: str) -> dict | None:
    # Fetch and delete the paste to prevent race conditions
    r = get_redis()
    raw = await r.getdel(_key(paste_id))
    return json.loads(raw) if raw else None


async def delete_paste(paste_id: str) -> None:
    r = get_redis()
    await r.delete(_key(paste_id))
