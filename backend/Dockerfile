FROM python:3.12-slim

# Patch OS-level security vulnerabilities
RUN apt-get update && apt-get upgrade -y && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# install uv
RUN pip install --no-cache-dir uv

# copy dependency files first for layer caching
COPY pyproject.toml uv.lock ./

# Install dependencies without the application code (for layer caching)
RUN uv sync --frozen --no-dev --no-install-project

# Copy application source code
COPY app/ ./app/
COPY worker/ ./worker/

# Sync the project itself
RUN uv sync --frozen --no-dev

# Place virtual environment executables in PATH
ENV PATH="/app/.venv/bin:$PATH"

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
