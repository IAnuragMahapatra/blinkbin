FROM python:3.12-slim

WORKDIR /app

# install uv
RUN pip install --no-cache-dir uv

# copy dependency files first for layer caching
COPY pyproject.toml .
COPY requirements.txt .

RUN uv pip install --system --no-cache -r requirements.txt

COPY app/ ./app/
COPY worker/ ./worker/

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
