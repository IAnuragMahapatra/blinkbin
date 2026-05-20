import json
import logging
from aiokafka import AIOKafkaProducer
from app.config import KAFKA_BOOTSTRAP, KAFKA_TOPIC

log = logging.getLogger(__name__)

_producer: AIOKafkaProducer | None = None


async def start_producer() -> None:
    global _producer
    _producer = AIOKafkaProducer(
        bootstrap_servers=KAFKA_BOOTSTRAP,
        value_serializer=lambda v: json.dumps(v).encode(),
        key_serializer=lambda k: k.encode() if k else None,
    )
    await _producer.start()
    log.info("Kafka producer started")


async def stop_producer() -> None:
    global _producer
    if _producer:
        await _producer.stop()
        _producer = None


async def publish(event: dict, paste_id: str) -> None:
    if not _producer:
        log.warning("Kafka producer not running — skipping event publish")
        return
    try:
        await _producer.send_and_wait(KAFKA_TOPIC, value=event, key=paste_id)
    except Exception as exc:
        # This is not a fatal error since Redis will still expire the paste
        log.error("Kafka publish failed: %s", exc)
