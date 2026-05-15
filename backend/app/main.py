import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routes.paste import router
from app.redis_client import close_redis
from app.kafka_producer import start_producer, stop_producer

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
log = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await start_producer()
    yield
    await stop_producer()
    await close_redis()
    log.info("Shutdown complete")


app = FastAPI(
    title="BlinkBin API",
    description="Zero-knowledge ephemeral secret sharing",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://blinkbin.xyz"],
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type"],
)

app.include_router(router)


@app.get("/health")
async def health():
    return {"status": "ok"}
