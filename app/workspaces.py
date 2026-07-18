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


# ── File catalog: the documents the in-app file browser offers ────────────────
# kind: jd (HR fit context) | cv (HR) | contract (Legal) | invoice (Finance).
# Some carry a prompt-injection payload (hidden white text, or a disguised note) —
# deliberately NOT flagged here; the guard is what has to catch them. Regenerate
# the PDFs with `python scripts/build_catalog_pdfs.py`.
CATALOG = [
    # HR — job descriptions (used as fit context, not screened)
    {"id": "jd_swe", "team": "hr", "kind": "jd", "label": "Senior Software Engineer",
     "sub": "Job description", "file": "hr/JD_Senior_Software_Engineer.pdf"},
    {"id": "jd_data", "team": "hr", "kind": "jd", "label": "Data Analyst",
     "sub": "Job description", "file": "hr/JD_Data_Analyst.pdf"},
    # HR — candidate CVs
    {"id": "cv_priya", "team": "hr", "kind": "cv", "label": "Priya Nair",
     "sub": "Backend Engineer", "file": "hr/CV_Priya_Nair.pdf"},
    {"id": "cv_marcus", "team": "hr", "kind": "cv", "label": "Marcus Reed",
     "sub": "Data Analyst", "file": "hr/CV_Marcus_Reed.pdf"},
    {"id": "cv_linh", "team": "hr", "kind": "cv", "label": "Linh Tran",
     "sub": "Frontend Developer", "file": "hr/CV_Linh_Tran.pdf"},
    {"id": "cv_ethan", "team": "hr", "kind": "cv", "label": "Ethan Le",
     "sub": "Software Engineer", "file": "hr/CV_Ethan_Le.pdf"},
    {"id": "cv_hannah", "team": "hr", "kind": "cv", "label": "Hannah Cole",
     "sub": "Recruiting Operations", "file": "hr/CV_Hannah_Cole.pdf"},
    # Legal — contracts
    {"id": "ct_atlas", "team": "legal", "kind": "contract", "label": "Atlas Logistics Inc",
     "sub": "Statement of Work", "file": "legal/Contract_Atlas_Logistics_SOW.pdf"},
    {"id": "ct_brightpath", "team": "legal", "kind": "contract", "label": "Brightpath / Cendra Labs",
     "sub": "Mutual NDA", "file": "legal/Contract_Brightpath_NDA.pdf"},
    {"id": "ct_meridian", "team": "legal", "kind": "contract", "label": "Meridian Consulting Ltd",
     "sub": "Services Agreement", "file": "legal/Contract_Meridian_Services.pdf"},
    {"id": "ct_vertex", "team": "legal", "kind": "contract", "label": "Vertex Supply Co",
     "sub": "Vendor Agreement", "file": "legal/Contract_Vertex_Vendor.pdf"},
    # Finance — invoices
    {"id": "inv_orion", "team": "finance", "kind": "invoice", "label": "Orion Office Supplies",
     "sub": "Invoice 9982 - $4,601", "file": "finance/Invoice_Orion_9982.pdf"},
    {"id": "inv_northwind", "team": "finance", "kind": "invoice", "label": "Northwind Print & Design",
     "sub": "Invoice INV-2043 - $1,534", "file": "finance/Invoice_Northwind_2043.pdf"},
    {"id": "inv_zephyr", "team": "finance", "kind": "invoice", "label": "Zephyr Logistics",
     "sub": "Invoice 5510 - $3,420", "file": "finance/Invoice_Zephyr_5510.pdf"},
    {"id": "inv_apex", "team": "finance", "kind": "invoice", "label": "Apex Cloud Services",
     "sub": "Invoice 7731 - $5,500", "file": "finance/Invoice_Apex_Cloud_7731.pdf"},
]
_BY_ID = {d["id"]: d for d in CATALOG}


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


def _entry(d: dict) -> dict:
    meta = _file_meta(d["file"])  # keep the catalog kind (jd/cv/...), not the file type
    return {"id": d["id"], "kind": d["kind"], "label": d["label"], "sub": d["sub"],
            "filename": meta["filename"], "size_kb": meta["size_kb"]}


def catalog_for(team: str) -> dict:
    """Files the browser offers this team, grouped by kind (jd/cv/contract/invoice)."""
    grouped: dict = {}
    for d in CATALOG:
        if d["team"] == team:
            grouped.setdefault(d["kind"], []).append(_entry(d))
    return grouped


def resolve_document(item_id: str, team: str):
    """Return (doc, absolute_path) if item_id exists and belongs to team, else (None, None)."""
    doc = _BY_ID.get(item_id)
    if not doc or doc["team"] != team:
        return None, None
    return doc, os.path.join(_SAMPLES_DIR, doc["file"])


def downstream_task(doc: dict) -> tuple:
    """(request, context, source_label) for a screened catalog document."""
    return team_request(doc["team"]), None, f"{doc['label']} - {doc['sub']}"
