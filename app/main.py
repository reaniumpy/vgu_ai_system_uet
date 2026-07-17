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

# Friendly metadata for the in-app "try an example" documents.
_SAMPLE_META = {
    "clean_resume.txt": {
        "label": "A normal résumé",
        "description": "An ordinary candidate résumé with nothing hidden inside.",
        "expected": "safe",
    },
    "resume_with_hidden_instruction.txt": {
        "label": "Résumé with a hidden instruction",
        "description": "Looks like a résumé, but hides an instruction telling the AI to auto-approve it.",
        "expected": "blocked",
    },
    "contract_with_data_trap.txt": {
        "label": "Contract with a data trap",
        "description": "A vendor contract that hides an instruction to email private data outside the company.",
        "expected": "blocked",
    },
    "invoice_with_agent_hijack.txt": {
        "label": "Invoice with a hidden command",
        "description": "An invoice that hides an instruction telling the AI to delete supplier records.",
        "expected": "blocked",
    },
}

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
    file: UploadFile = File(None),
):
    """Screen a pasted or uploaded document, then (if safe) run the assistant."""
    source = "Pasted text"
    document = (text or "").strip()

    if file is not None and file.filename:
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
    items = []
    for name, meta in _SAMPLE_META.items():
        path = os.path.join(_SAMPLES_DIR, name)
        if not os.path.exists(path):
            continue
        with open(path, "r", encoding="utf-8") as fh:
            items.append({"name": name, "text": fh.read(), **meta})
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
