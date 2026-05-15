import time
import uuid
import logging
from fastapi import APIRouter, HTTPException, Response
from app.models import (
    CreatePasteRequest, CreatePasteResponse,
    ReadPasteResponse, LockedResponse,
)
from app.redis_client import store_paste, get_paste, get_and_delete_paste
from app.kafka_producer import publish
from app.config import HARD_EXPIRY_DAYS

router = APIRouter(prefix="/api", tags=["paste"])
log = logging.getLogger(__name__)


@router.post("/paste", response_model=CreatePasteResponse, status_code=201)
async def create_paste(req: CreatePasteRequest):
    now = int(time.time())
    paste_id = str(uuid.uuid4())

    # Dead Drop: hard cap starts from unlock date, not creation date
    if req.unlock_at_unix:
        hard_delete_at = req.unlock_at_unix + HARD_EXPIRY_DAYS * 86400
    else:
        hard_delete_at = now + HARD_EXPIRY_DAYS * 86400

    data = {
        "ciphertext": req.ciphertext,
        "round_id": req.round_id,
        "burn_on_read": req.burn_on_read,
        "burn_after_ttl_seconds": req.burn_after_ttl_seconds,
        "language": req.language,
        "created_at": now,
        "hard_delete_at": hard_delete_at,
        "unlock_at_unix": req.unlock_at_unix,
    }

    # compute Redis TTL — for Dead Drop, countdown starts from unlock time
    redis_ttl = None
    if req.burn_after_ttl_seconds:
        if req.unlock_at_unix:
            # TTL starts from unlock, so expire at unlock + ttl
            redis_ttl = (req.unlock_at_unix - now) + req.burn_after_ttl_seconds
        else:
            redis_ttl = req.burn_after_ttl_seconds

    await store_paste(paste_id, data, ttl=redis_ttl)

    # publish hard_delete event for every paste — unconditional backstop
    await publish(
        {"event": "hard_delete", "paste_id": paste_id, "delete_at": hard_delete_at},
        paste_id,
    )

    # publish burn_after_ttl event if applicable
    if req.burn_after_ttl_seconds:
        if req.unlock_at_unix:
            delete_at = req.unlock_at_unix + req.burn_after_ttl_seconds
        else:
            delete_at = now + req.burn_after_ttl_seconds
        await publish(
            {"event": "burn_after_ttl", "paste_id": paste_id, "delete_at": delete_at},
            paste_id,
        )

    log.info("Created paste %s (burn_on_read=%s, ttl=%s, dead_drop=%s)",
             paste_id, req.burn_on_read, req.burn_after_ttl_seconds, req.round_id)

    return CreatePasteResponse(
        paste_id=paste_id,
        created_at=now,
        hard_delete_at=hard_delete_at,
        unlock_at=req.unlock_at_unix,
    )


@router.get("/paste/{paste_id}")
async def read_paste(paste_id: str, response: Response):
    data = await get_paste(paste_id)
    if not data:
        raise HTTPException(status_code=404, detail="not found")

    now = int(time.time())
    unlock_at = data.get("unlock_at_unix")
    round_id = data.get("round_id")

    # 423 if Dead Drop hasn't unlocked yet
    if round_id and unlock_at and unlock_at > now:
        response.status_code = 423
        return LockedResponse(round_id=round_id, unlock_at=unlock_at)

    # atomic delete on burn-on-read
    if data["burn_on_read"]:
        fetched = await get_and_delete_paste(paste_id)
        if not fetched:
            raise HTTPException(status_code=404, detail="not found")
        data = fetched

    return ReadPasteResponse(
        ciphertext=data["ciphertext"],
        language=data["language"],
        burn_on_read=data["burn_on_read"],
        hard_delete_at=data["hard_delete_at"],
        round_id=round_id,
    )
