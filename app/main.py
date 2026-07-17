"""cortis web app — routes and startup.

Two screens:
  /        the everyday "Document Safety Check" (Cohort A)
  /admin   the monitoring view for technical staff (Cohort B)
"""

import os

from fastapi import FastAPI, File, Form, UploadFile
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from . import assistant, config, guard, logstore
from .extract import ExtractionError, extract_from_upload

_STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")
_SAMPLES_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "samples")

# The curated set of documents offered in the in-app file browser. Names are
# neutral on purpose — the browser looks like a real folder, so a test
# participant can't tell which files are safe vs. an attack from the list.
_SAMPLE_FILES = [
    "David_Chen_Resume.pdf",
    "Ethan_Le_Resume.txt",
    "Maria_Alvarez_Resume.pdf",
    "Meridian_Services_Agreement.txt",
    "Northwind_Invoice_INV-2043.txt",
    "Orion_Invoice_9982.txt",
    "Sophia_Tran_Resume.txt",
]

_KINDS = {".pdf": "PDF document", ".docx": "Word document", ".txt": "Text document",
          ".md": "Text document"}


def _sample_kind(name: str) -> str:
    return _KINDS.get(os.path.splitext(name)[1].lower(), "Document")


app = FastAPI(title="cortis — Document Safety Check")


@app.on_event("startup")
def _startup() -> None:
    logstore.seed_if_empty()
    guard.warmup()  # load the model now so the first real check is fast


# ── Pages ────────────────────────────────────────────────────────────────────
@app.get("/")
def index():
    return FileResponse(os.path.join(_STATIC_DIR, "index.html"))


@app.get("/admin")
def admin():
    return FileResponse(os.path.join(_STATIC_DIR, "admin.html"))


# ── Core check API ─────────────────────────────────────────────────────────
@app.post("/api/check")
async def check(
    text: str = Form(""),
    request: str = Form(""),
    team: str = Form(""),
    sample: str = Form(""),
    file: UploadFile = File(None),
):
    """Screen a chosen sample, pasted text, or uploaded file; then (if safe) run the assistant."""
    source = "Pasted text"
    document = (text or "").strip()

    if sample:
        if sample not in _SAMPLE_FILES:
            return _error("That document isn't available. Please choose one from the list.")
        with open(os.path.join(_SAMPLES_DIR, sample), "rb") as fh:
            data = fh.read()
        try:
            document = extract_from_upload(sample, data).strip()
        except ExtractionError as exc:
            return _error(str(exc))
        source = sample
    elif file is not None and file.filename:
        data = await file.read()
        if len(data) > config.MAX_UPLOAD_BYTES:
            return _error("That file is too large. Please use a file under 5 MB.")
        try:
            document = extract_from_upload(file.filename, data).strip()
        except ExtractionError as exc:
            return _error(str(exc))
        source = file.filename

    if not document:
        return _error("Add a document first — paste some text or choose a file to check.")

    team = team if team in config.TEAMS else (team or "Unspecified")
    result = guard.check_text(document)
    logstore.record_check(source=source, team=team, result=result)

    payload = dict(result)
    payload["source"] = source
    payload["team"] = team
    payload["assistant"] = assistant.run(request, document) if result["verdict"] == "safe" else None
    return JSONResponse(payload)


# ── Monitoring API (Cohort B) ────────────────────────────────────────────────
@app.get("/api/stats")
def stats():
    return JSONResponse(logstore.stats())


# ── Samples & config helpers ─────────────────────────────────────────────────
@app.get("/api/samples")
def samples():
    """Neutral file listing for the in-app browser — no safe/attack hints."""
    items = []
    for name in _SAMPLE_FILES:
        path = os.path.join(_SAMPLES_DIR, name)
        if not os.path.exists(path):
            continue
        items.append(
            {
                "name": name,
                "kind": _sample_kind(name),
                "size_kb": max(1, round(os.path.getsize(path) / 1024)),
            }
        )
    return JSONResponse({"samples": items})


@app.get("/api/config")
def client_config():
    return JSONResponse({"teams": config.TEAMS, "assistant_enabled": assistant.is_configured()})


@app.get("/api/health")
def health():
    return JSONResponse({"status": "ok"})


app.mount("/static", StaticFiles(directory=_STATIC_DIR), name="static")


def _error(message: str, status: int = 400) -> JSONResponse:
    return JSONResponse({"error": message}, status_code=status)
