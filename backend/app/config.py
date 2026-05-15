import os

# single source of truth — change here only
HARD_EXPIRY_DAYS = 30

REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379")
KAFKA_BOOTSTRAP = os.getenv("KAFKA_BOOTSTRAP", "kafka:9092")
KAFKA_TOPIC = "paste-events"

ALLOWED_LANGUAGES = {
    "plaintext", "python", "javascript", "typescript", "sql",
    "bash", "json", "yaml", "go", "rust", "c", "cpp", "markdown",
    "html", "css", "java", "kotlin", "swift", "php", "ruby",
}
