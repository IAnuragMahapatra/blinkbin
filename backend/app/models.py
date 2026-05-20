from pydantic import BaseModel, field_validator, model_validator
from typing import Optional
import time
from app.config import HARD_EXPIRY_DAYS, ALLOWED_LANGUAGES


class CreatePasteRequest(BaseModel):
    ciphertext: str
    burn_on_read: bool = False
    burn_after_ttl_seconds: Optional[int] = None
    round_id: Optional[int] = None
    unlock_at_unix: Optional[int] = None
    language: str = "plaintext"

    @field_validator("ciphertext")
    @classmethod
    def ciphertext_size(cls, v: str) -> str:
        # Ensure the payload stays under 1MB
        if len(v.encode()) > 1_048_576:
            raise ValueError("ciphertext exceeds 1MB limit")
        return v

    @field_validator("language")
    @classmethod
    def language_allowed(cls, v: str) -> str:
        if v not in ALLOWED_LANGUAGES:
            raise ValueError(f"unsupported language: {v}")
        return v

    @field_validator("burn_after_ttl_seconds")
    @classmethod
    def ttl_max(cls, v: Optional[int]) -> Optional[int]:
        if v is not None:
            max_ttl = HARD_EXPIRY_DAYS * 86400
            if v <= 0 or v > max_ttl:
                raise ValueError(f"TTL must be between 1s and {max_ttl}s")
        return v

    @model_validator(mode="after")
    def unlock_at_check(self) -> "CreatePasteRequest":
        if self.unlock_at_unix is not None:
            now = int(time.time())
            if self.unlock_at_unix <= now:
                raise ValueError("unlock_at_unix must be in the future")
            max_future = now + HARD_EXPIRY_DAYS * 86400
            if self.unlock_at_unix > max_future:
                raise ValueError(f"unlock_at_unix exceeds {HARD_EXPIRY_DAYS}-day cap")
        return self


class CreatePasteResponse(BaseModel):
    paste_id: str
    created_at: int
    hard_delete_at: int
    unlock_at: Optional[int] = None


class ReadPasteResponse(BaseModel):
    ciphertext: str
    language: str
    burn_on_read: bool
    hard_delete_at: int
    round_id: Optional[int] = None


class LockedResponse(BaseModel):
    error: str = "locked"
    round_id: int
    unlock_at: int
