"""cortis web app — role-based workspaces in front of the injection guard.

Sign in as a team member (HR / Legal / Finance / Security) and land in a workspace
tuned to that team's job. Every action runs through the guard first; only safe
documents reach the AI assistant.
"""

import os

from fastapi import FastAPI, Form, Request
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.sessions import SessionMiddleware

from . import assistant, config, guard, logstore, workspaces
from .extract import ExtractionError, extract_from_upload

_STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")

# Per-team task for pasted (ad-hoc) text — no attached JD/context.
_PASTE_REQUEST = {
    "hr": "Summarise this résumé: key experience, skills, and total years.",
    "legal": "Review this agreement in plain language: parties, key obligations, and anything worth a closer legal look.",
    "finance": "Extract the key details for accounts payable: vendor, invoice number, date, line items, and total.",
}

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
    acct = _current(request)
    if acct:
        return RedirectResponse(workspaces.home_path(acct["team"]), status_code=303)
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
@app.get("/api/workspace")
def api_workspace(request: Request):
    acct = _current(request)
    if not acct:
        return JSONResponse({"error": "not signed in"}, status_code=401)
    return JSONResponse(workspaces.workspace_data(acct["team"]))


@app.post("/api/check")
async def api_check(request: Request, item: str = Form(""), text: str = Form("")):
    acct = _current(request)
    if not acct:
        return JSONResponse({"error": "Please sign in again."}, status_code=401)
    team = acct["team"]
    if team == "security":
        return _error("The monitoring account doesn't screen documents.")

    if item:
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
    else:
        document = (text or "").strip()
        if not document:
            return _error("Add a document first — choose one from your workspace or paste text.")
        req, context, source = _PASTE_REQUEST.get(team, ""), None, "Pasted text"

    result = guard.check_text(document)
    logstore.record_check(
        source=source, team=workspaces.TEAMS[team]["label"], result=result, user=acct["name"],
    )

    payload = dict(result)
    payload["source"] = source
    payload["assistant"] = (
        assistant.run(req, document, context) if result["verdict"] == "safe" else None
    )
    return JSONResponse(payload)


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
