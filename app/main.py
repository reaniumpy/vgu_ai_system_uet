"""cortis web app — role-based workspaces in front of the injection guard.

Sign in as a team member (HR / Legal / Finance / Security) and land in a workspace
tuned to that team's job. Every action runs through the guard first; only safe
documents reach the AI assistant.
"""

import os
import re

from fastapi import FastAPI, File, Form, Request, UploadFile
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.sessions import SessionMiddleware

from . import assistant, config, guard, logstore, workspaces
from .extract import ExtractionError, extract_from_upload

_STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")

_FIT_RE = re.compile(r"FIT:\s*(Strong|Partial|Weak)", re.I)


def _parse_fit(text: str):
    """Pull the 'FIT: Strong/Partial/Weak' marker out of the assistant's reply."""
    m = _FIT_RE.search(text or "")
    fit = m.group(1).capitalize() if m else None
    cleaned = re.sub(r"^\s*FIT:\s*(Strong|Partial|Weak)\s*\n*", "", text or "", flags=re.I).lstrip()
    return fit, (cleaned or text)


app = FastAPI(title="cortis")
app.add_middleware(
    SessionMiddleware,
    secret_key=os.environ.get("CORTIS_SECRET_KEY", "dev-insecure-secret-change-in-production"),
    same_site="lax",
)


@app.on_event("startup")
def _startup() -> None:
    logstore.seed_if_empty()
    guard.warmup()


# ── Auth helpers ─────────────────────────────────────────────────────────────
def _current(request: Request):
    """Return the signed-in account (with id + team meta) or None."""
    aid = request.session.get("account")
    acct = workspaces.account(aid) if aid else None
    if not acct:
        return None
    return {"id": aid, **acct}


def _page(name: str) -> FileResponse:
    return FileResponse(os.path.join(_STATIC_DIR, name))


# ── Auth routes ──────────────────────────────────────────────────────────────
@app.get("/login")
def login_page(request: Request):
    # Always show the account picker; if already signed in, login.js marks that
    # account as current and disables it (you can't re-select the role you're in).
    return _page("login.html")


@app.get("/api/accounts")
def api_accounts():
    return JSONResponse({"accounts": workspaces.accounts_for_login()})


@app.post("/api/login")
def api_login(request: Request, account: str = Form(...)):
    acct = workspaces.account(account)
    if not acct:
        return JSONResponse({"error": "Unknown account."}, status_code=400)
    request.session["account"] = account
    return JSONResponse({"redirect": workspaces.home_path(acct["team"])})


@app.post("/api/logout")
def api_logout(request: Request):
    request.session.clear()
    return JSONResponse({"redirect": "/login"})


@app.get("/api/me")
def api_me(request: Request):
    acct = _current(request)
    if not acct:
        return JSONResponse({"error": "not signed in"}, status_code=401)
    team = acct["team"]
    return JSONResponse({
        "id": acct["id"], "name": acct["name"], "title": acct["title"],
        "team": team, "team_meta": workspaces.TEAMS[team],
    })


# ── Pages (role-routed) ──────────────────────────────────────────────────────
@app.get("/")
def index(request: Request):
    acct = _current(request)
    if not acct:
        return RedirectResponse("/login", status_code=303)
    return RedirectResponse(workspaces.home_path(acct["team"]), status_code=303)


def _workspace_page(request: Request, team: str):
    acct = _current(request)
    if not acct:
        return RedirectResponse("/login", status_code=303)
    if acct["team"] != team:
        return RedirectResponse(workspaces.home_path(acct["team"]), status_code=303)
    return _page("workspace.html")


@app.get("/hr")
def hr_page(request: Request):
    return _workspace_page(request, "hr")


@app.get("/legal")
def legal_page(request: Request):
    return _workspace_page(request, "legal")


@app.get("/finance")
def finance_page(request: Request):
    return _workspace_page(request, "finance")


@app.get("/monitoring")
def monitoring_page(request: Request):
    acct = _current(request)
    if not acct:
        return RedirectResponse("/login", status_code=303)
    if acct["team"] != "security":
        return RedirectResponse(workspaces.home_path(acct["team"]), status_code=303)
    return _page("monitoring.html")


# ── Workspace data + check API ───────────────────────────────────────────────
@app.get("/api/catalog")
def api_catalog(request: Request):
    """The file catalog the in-app browser lists, grouped by kind, for this team."""
    acct = _current(request)
    if not acct:
        return JSONResponse({"error": "not signed in"}, status_code=401)
    return JSONResponse(workspaces.catalog_for(acct["team"]))


@app.get("/api/document")
def api_document(request: Request, id: str):
    """Extracted text of one catalog document (used to load a JD as fit context)."""
    acct = _current(request)
    if not acct:
        return JSONResponse({"error": "not signed in"}, status_code=401)
    doc, path = workspaces.resolve_document(id, acct["team"])
    if not doc:
        return _error("That document isn't in your workspace.")
    with open(path, "rb") as fh:
        data = fh.read()
    try:
        text = extract_from_upload(os.path.basename(path), data).strip()
    except ExtractionError as exc:
        return _error(str(exc))
    return JSONResponse({"id": id, "title": doc["label"], "text": text,
                         "filename": os.path.basename(path)})


@app.post("/api/hr/jd")
async def api_hr_jd(request: Request, file: UploadFile = File(...)):
    """HR uploads a job description; return its title + extracted text."""
    acct = _current(request)
    if not acct:
        return JSONResponse({"error": "Please sign in again."}, status_code=401)
    if acct["team"] != "hr":
        return JSONResponse({"error": "not authorised"}, status_code=403)
    data = await file.read()
    if len(data) > config.MAX_UPLOAD_BYTES:
        return _error("That file is too large. Please use a file under 5 MB.")
    try:
        text = extract_from_upload(file.filename, data).strip()
    except ExtractionError as exc:
        return _error(str(exc))
    if not text:
        return _error("That job description appears to be empty.")
    title = next((ln.strip() for ln in text.splitlines() if ln.strip()), file.filename)
    if len(title) > 120:
        title = title[:117] + "…"
    return JSONResponse({"title": title, "text": text, "filename": file.filename})


@app.post("/api/check")
async def api_check(request: Request, item: str = Form(""), jd: str = Form(""),
                    lang: str = Form("en"), file: UploadFile = File(None)):
    """Screen an uploaded file (or seeded sample); then (if safe) run the team's assistant task."""
    acct = _current(request)
    if not acct:
        return JSONResponse({"error": "Please sign in again."}, status_code=401)
    team = acct["team"]
    if team == "security":
        return _error("The monitoring account doesn't screen documents.")

    context = None
    if file is not None and file.filename:
        data = await file.read()
        if len(data) > config.MAX_UPLOAD_BYTES:
            return _error("That file is too large. Please use a file under 5 MB.")
        try:
            document = extract_from_upload(file.filename, data).strip()
        except ExtractionError as exc:
            return _error(str(exc))
        source = file.filename
        req = workspaces.team_request(team)
        if team == "hr" and jd.strip():
            context = jd.strip()
    elif item:
        doc, path = workspaces.resolve_document(item, team)
        if not doc:
            return _error("That document isn't in your workspace.")
        with open(path, "rb") as fh:
            data = fh.read()
        try:
            document = extract_from_upload(os.path.basename(path), data).strip()
        except ExtractionError as exc:
            return _error(str(exc))
        req, context, source = workspaces.downstream_task(doc)
        if team == "hr" and jd.strip():
            context = jd.strip()          # screen a catalog CV against the chosen JD
    else:
        return _error("Add a document first — upload a file to check.")

    if not document:
        return _error("That document appears to be empty.")

    result = guard.check_text(document)
    logstore.record_check(
        source=source, team=workspaces.TEAMS[team]["label"], result=result, user=acct["name"],
    )

    payload = dict(result)
    payload["source"] = source
    if result["verdict"] == "safe":
        answer = assistant.run(req, document, context, lang)
        if team == "hr":
            fit, answer["text"] = _parse_fit(answer.get("text", ""))
            payload["fit_level"] = fit
        payload["assistant"] = answer
    else:
        payload["assistant"] = None
        if team == "hr":
            payload["fit_level"] = None
    return JSONResponse(payload)


_REPORT_TYPES = {"false_positive", "threat", "missed_threat"}


@app.post("/api/report")
async def api_report(request: Request, report_type: str = Form(...), reason: str = Form(""),
                     source: str = Form(""), verdict: str = Form(""), category: str = Form(""),
                     confidence: str = Form(""), excerpt: str = Form("")):
    """A team member flags a result for Security — false positive or escalation."""
    acct = _current(request)
    if not acct:
        return JSONResponse({"error": "Please sign in again."}, status_code=401)
    if report_type not in _REPORT_TYPES:
        return _error("Unknown report type.")
    try:
        conf = float(confidence) if confidence else None
    except ValueError:
        conf = None
    logstore.record_report(
        report_type=report_type, reason=reason.strip()[:500],
        source=(source.strip()[:200] or "(unspecified)"),
        team=workspaces.TEAMS[acct["team"]]["label"], user=acct["name"],
        verdict=(verdict or None), category=(category or None), confidence=conf,
        excerpt=(excerpt.strip()[:300] or None),
    )
    return JSONResponse({"ok": True})


# ── Monitoring API (Security only) ───────────────────────────────────────────
@app.get("/api/stats")
def api_stats(request: Request):
    acct = _current(request)
    if not acct or acct["team"] != "security":
        return JSONResponse({"error": "not authorised"}, status_code=403)
    return JSONResponse(logstore.stats())


@app.get("/api/health")
def health():
    return JSONResponse({"status": "ok"})


app.mount("/static", StaticFiles(directory=_STATIC_DIR), name="static")


def _error(message: str, status: int = 400) -> JSONResponse:
    return JSONResponse({"error": message}, status_code=status)
