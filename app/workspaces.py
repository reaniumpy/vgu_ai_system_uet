"""Accounts, teams, and each team's task + documents.

HR uploads a job description and candidate CVs, and cortis screens each CV for
hidden instructions ("cheating") and assesses fit against the JD. Legal and
Finance upload a document (or pick a sample) and cortis screens it before the AI
assistant reviews it. The injection guard runs underneath every action.
"""

import os

_SAMPLES_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "samples")

MAX_CVS = 10  # HR batch upload cap

# ── Accounts (passwordless demo sign-in) ─────────────────────────────────────
ACCOUNTS = {
    "sophia": {"name": "Sophia Tran", "title": "Senior HR Recruiter", "team": "hr"},
    "nghia": {"name": "Nghia Le", "title": "Legal Counsel", "team": "legal"},
    "long": {"name": "Long Vu", "title": "Accounts Payable Officer", "team": "finance"},
    "an": {"name": "An Tran", "title": "Security Analyst", "team": "security"},
}

# ── Teams ────────────────────────────────────────────────────────────────────
TEAMS = {
    "hr": {"label": "Human Resources", "accept": [".pdf", ".docx", ".txt"]},
    "legal": {"label": "Legal", "accept": [".pdf", ".docx", ".txt"]},
    "finance": {"label": "Finance", "accept": [".pdf", ".docx", ".txt"]},
    "security": {"label": "Security", "accept": []},
}

# ── Per-team downstream task (runs only on SAFE documents) ────────────────────
HR_FIT_REQUEST = (
    "Assess this candidate's résumé against the job description in the reference material. "
    "On the FIRST line output exactly one of these tokens, in English: 'FIT: Strong', "
    "'FIT: Partial', or 'FIT: Weak'. Then a blank line, then a brief assessment: which key "
    "requirements are clearly met, which are missing or unclear, and a one-line recommendation."
)
LEGAL_REQUEST = (
    "Review this agreement for a busy non-lawyer. Briefly cover: the parties, each side's main "
    "obligations, fees, the term and termination notice, and flag any clause that deserves a "
    "closer legal look. Plain language."
)
FINANCE_REQUEST = (
    "Extract the key details from this invoice for accounts payable: vendor, invoice number, "
    "date, line items, subtotal, tax, total, and payment terms/due date. Note any figure that "
    "does not add up."
)


def team_request(team: str) -> str:
    return {"legal": LEGAL_REQUEST, "finance": FINANCE_REQUEST, "hr": HR_FIT_REQUEST}.get(
        team, "Summarise the key points of this document."
    )


# ── Seeded sample documents for Legal / Finance (quick examples to try) ───────
_AGREEMENTS = [
    {"id": "a_meridian", "label": "Meridian Consulting Ltd", "sub": "Services Agreement",
     "file": "legal/Meridian_Services_Agreement.txt"},
    {"id": "a_atlas", "label": "Atlas Logistics Inc", "sub": "Statement of Work",
     "file": "legal/Atlas_Logistics_SOW.txt"},
]
_INVOICES = [
    {"id": "i_orion", "label": "Orion Office Supplies", "sub": "Invoice 9982 · $4,601",
     "file": "finance/Orion_Invoice_9982.txt"},
    {"id": "i_northwind", "label": "Northwind Print & Design", "sub": "Invoice INV-2043 · $1,534",
     "file": "finance/Northwind_Invoice_INV-2043.txt"},
]

_DOCS = {}
for _a in _AGREEMENTS:
    _DOCS[_a["id"]] = {**_a, "team": "legal"}
for _i in _INVOICES:
    _DOCS[_i["id"]] = {**_i, "team": "finance"}


def account(account_id: str):
    return ACCOUNTS.get(account_id)


def accounts_for_login() -> list:
    return [
        {"id": aid, "name": a["name"], "title": a["title"],
         "team": a["team"], "team_label": TEAMS[a["team"]]["label"]}
        for aid, a in ACCOUNTS.items()
    ]


def home_path(team: str) -> str:
    return "/monitoring" if team == "security" else f"/{team}"


def _kind(name: str) -> str:
    return {".pdf": "PDF document", ".docx": "Word document"}.get(
        os.path.splitext(name)[1].lower(), "Text document")


def _file_meta(file_rel: str) -> dict:
    path = os.path.join(_SAMPLES_DIR, file_rel)
    filename = os.path.basename(file_rel)
    size_kb = max(1, round(os.path.getsize(path) / 1024)) if os.path.exists(path) else 0
    return {"filename": filename, "kind": _kind(filename), "size_kb": size_kb}


def workspace_data(team: str) -> dict:
    """Team-scoped sample documents (Legal/Finance). HR is upload-driven."""
    if team == "legal":
        return {"docs": [{"id": a["id"], "label": a["label"], "sub": a["sub"], **_file_meta(a["file"])}
                         for a in _AGREEMENTS]}
    if team == "finance":
        return {"docs": [{"id": i["id"], "label": i["label"], "sub": i["sub"], **_file_meta(i["file"])}
                        for i in _INVOICES]}
    return {"docs": []}


def resolve_document(item_id: str, team: str):
    """Return (doc, absolute_path) if item_id exists and belongs to team, else (None, None)."""
    doc = _DOCS.get(item_id)
    if not doc or doc["team"] != team:
        return None, None
    return doc, os.path.join(_SAMPLES_DIR, doc["file"])


def downstream_task(doc: dict) -> tuple:
    """(request, context, source_label) for a seeded Legal/Finance sample."""
    team = doc["team"]
    return team_request(team), None, f"{doc['label']} — {doc['sub']}"
