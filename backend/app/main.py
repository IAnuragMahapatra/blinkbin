import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
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

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    for err in exc.errors():
        if err.get("loc") == ("body", "ciphertext") and "exceeds 1MB limit" in err.get("msg", ""):
            return JSONResponse(status_code=413, content={"detail": err.get("msg")})
    return JSONResponse(status_code=422, content={"detail": exc.errors()})


app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://blinkbin.xyz", "http://localhost:5173", "http://127.0.0.1:5173", "http://localhost"],
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type"],
)

app.include_router(router)


@app.get("/api/health")
async def api_health():
    return {"status": "ok"}

@app.get("/health")
async def health():
    return {"status": "ok"}
