# cortis — Document Safety Check
# A prompt-injection guard that sits in front of an LLM.
#
# Single-stage image: install deps, bake the detection model in, run the app.
# Build & run is one command each (see the Makefile / README).

FROM python:3.11-slim

# Keep PyTorch / tokenizers single-threaded. The classifier runs on tiny inputs,
# and multi-threaded BLAS/tokenizers have been a source of segfaults for this
# model — pinning threads makes the container predictable and stable.
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    OMP_NUM_THREADS=1 \
    MKL_NUM_THREADS=1 \
    TOKENIZERS_PARALLELISM=false \
    HF_HUB_DISABLE_TELEMETRY=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# 1) Engine dependencies first (CPU-only Torch keeps the image lean).
COPY requirements-engine.txt .
RUN pip install --no-cache-dir -r requirements-engine.txt

# 2) Bake the detection model into the image so runtime is fully offline.
#    Placed before app/LLM deps so swapping those doesn't re-download the model.
COPY scripts/download_model.py scripts/download_model.py
RUN python scripts/download_model.py

# 3) App + LLM dependencies (change more often than the engine).
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 4) Application code and demo sample documents.
COPY app app
COPY samples samples

# Model weights are already cached in the image; never reach out to the Hub at runtime.
ENV HF_HUB_OFFLINE=1 \
    TRANSFORMERS_OFFLINE=1 \
    CORTIS_HOST=0.0.0.0 \
    CORTIS_PORT=8000

EXPOSE 8000

# A healthy container serves the check API. (curl isn't in slim; use Python.)
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
    CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/api/health').status==200 else 1)"

CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
