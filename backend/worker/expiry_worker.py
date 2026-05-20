import asyncio
import json
import logging
import signal
from aiokafka import AIOKafkaConsumer
from app.config import KAFKA_BOOTSTRAP, KAFKA_TOPIC
from app.redis_client import delete_paste

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
log = logging.getLogger(__name__)

# Keep track of pending deletions
pending: dict[str, asyncio.Task] = {}


async def schedule_delete(paste_id: str, delete_at: int) -> None:
    import time
    delay = delete_at - time.time()
    if delay > 0:
        log.info("Scheduling DEL for %s in %.0fs", paste_id, delay)
        await asyncio.sleep(delay)
    await delete_paste(paste_id)
    log.info("Deleted paste %s", paste_id)
    pending.pop(paste_id, None)


async def consume() -> None:
    consumer = AIOKafkaConsumer(
        KAFKA_TOPIC,
        bootstrap_servers=KAFKA_BOOTSTRAP,
        group_id="expiry-worker",
        value_deserializer=lambda v: json.loads(v.decode()),
        auto_offset_reset="earliest",
    )
    await consumer.start()
    log.info("Expiry worker consuming from %s", KAFKA_TOPIC)
    try:
        async for msg in consumer:
            event = msg.value
            paste_id = event.get("paste_id")
            delete_at = event.get("delete_at")
            if not paste_id or not delete_at:
                continue

            # Cancel duplicate tasks before creating new ones
            if paste_id in pending:
                existing = pending[paste_id]
                if not existing.done():
                    existing.cancel()

            task = asyncio.create_task(schedule_delete(paste_id, delete_at))
            pending[paste_id] = task
    finally:
        await consumer.stop()


async def main() -> None:
    loop = asyncio.get_running_loop()

    shutdown = asyncio.Event()

    def _signal_handler():
        log.info("Shutdown signal received")
        shutdown.set()

    for sig in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(sig, _signal_handler)

    consume_task = asyncio.create_task(consume())

    await shutdown.wait()

    # Cancel running tasks and shut down
    for task in pending.values():
        task.cancel()
    consume_task.cancel()

    log.info("Expiry worker stopped")


if __name__ == "__main__":
    asyncio.run(main())
