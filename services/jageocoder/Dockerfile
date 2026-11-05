FROM python:3.12-slim
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 DATA_DIR=/data
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY app.py prepare.py ./
# Runs as root because the Rtree sidecar index under /data must be writable but the
# host bind mount is owned by the deploy user (chown to a container uid is not
# possible for a non-root process). The API is internal-only (no published port).
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=120s CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=4)"
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1", "--limit-concurrency", "32", "--timeout-keep-alive", "5", "--no-access-log"]
