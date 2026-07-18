"""Accounts, teams, and each team's documents + role-tailored downstream task.

This is the seed data that turns cortis from a generic "document checker" into a
role-based system: HR screens candidates against a job description, Legal reviews
agreements, Finance processes invoices — with the injection guard underneath
every action.
"""

import os

_SAMPLES_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "samples")

# ── Accounts (passwordless demo sign-in) ─────────────────────────────────────
# id -> profile. `team` drives which workspace and documents the account sees.
ACCOUNTS = {
    "sophia": {"name": "Sophia Tran", "title": "Senior HR Recruiter", "team": "hr"},
    "mai": {"name": "Mai Pham", "title": "Talent Coordinator", "team": "hr"},
    "nghia": {"name": "Nghia Le", "title": "Legal Counsel", "team": "legal"},
    "long": {"name": "Long Vu", "title": "Accounts Payable Officer", "team": "finance"},
    "an": {"name": "An Tran", "title": "Security Analyst", "team": "security"},
}

# ── Teams ────────────────────────────────────────────────────────────────────
TEAMS = {
    "hr": {
        "label": "Human Resources",
        "title": "Candidate screening",
        "blurb": "Screen a candidate's résumé against the role they applied for.",
        "doc_noun": "candidate",
        "action": "Screen candidate",
        "accept": [".pdf", ".docx", ".txt"],
    },
    "legal": {
        "label": "Legal",
        "title": "Contract review",
        "blurb": "Review an incoming agreement before it goes to the AI assistant.",
        "doc_noun": "agreement",
        "action": "Review agreement",
        "accept": [".pdf", ".docx", ".txt"],
    },
    "finance": {
        "label": "Finance",
        "title": "Invoice processing",
        "blurb": "Check an invoice before extracting its details for payment.",
        "doc_noun": "invoice",
        "action": "Process invoice",
        "accept": [".pdf", ".docx", ".txt"],
    },
    "security": {
        "label": "Security",
        "title": "Monitoring",
        "blurb": "Document-safety activity across the organisation.",
        "doc_noun": "event",
        "action": "",
        "accept": [],
    },
}

# ── HR: open positions (the JDs) and the candidates who applied ──────────────
POSITIONS = {
    "swe": {
        "title": "Senior Software Engineer",
        "department": "Engineering",
        "requirements": [
            "5+ years backend engineering",
            "Strong Python or Go",
            "Cloud infrastructure (AWS or GCP)",
            "Relational and in-memory databases",
            "Experience owning production systems on-call",
        ],
    },
    "analyst": {
        "title": "Data Analyst",
        "department": "Analytics",
        "requirements": [
            "3+ years in analytics",
            "SQL and Python (pandas)",
            "Dashboarding (Tableau or Looker)",
            "A/B testing",
            "Communicating findings to non-technical stakeholders",
        ],
    },
    "pm": {
        "title": "Project Manager",
        "department": "Operations",
        "requirements": [
            "5+ years project management",
            "Agile / Scrum delivery",
            "Budget and stakeholder management",
            "Leading cross-functional teams",
        ],
    },
}

# HR documents: candidate -> résumé file + the position they applied for.
_CANDIDATES = [
    {"id": "c_priya", "label": "Priya Nair", "file": "hr/Priya_Nair_Resume.txt", "position": "swe"},
    {"id": "c_ethan", "label": "Ethan Le", "file": "hr/Ethan_Le_Resume.txt", "position": "swe"},
    {"id": "c_david", "label": "David Chen", "file": "hr/David_Chen_Resume.pdf", "position": "swe"},
    {"id": "c_maria", "label": "Maria Alvarez", "file": "hr/Maria_Alvarez_Resume.pdf", "position": "analyst"},
    {"id": "c_sophia", "label": "Sophia Tran", "file": "hr/Sophia_Tran_Resume.txt", "position": "pm"},
]

# Legal documents.
_AGREEMENTS = [
    {"id": "a_meridian", "label": "Meridian Consulting Ltd", "sub": "Services Agreement",
     "file": "legal/Meridian_Services_Agreement.txt"},
    {"id": "a_atlas", "label": "Atlas Logistics Inc", "sub": "Statement of Work",
     "file": "legal/Atlas_Logistics_SOW.txt"},
]

# Finance documents.
_INVOICES = [
    {"id": "i_orion", "label": "Orion Office Supplies", "sub": "Invoice 9982 · $4,601",
     "file": "finance/Orion_Invoice_9982.txt"},
    {"id": "i_northwind", "label": "Northwind Print & Design", "sub": "Invoice INV-2043 · $1,534",
     "file": "finance/Northwind_Invoice_INV-2043.txt"},
]

# One flat index of every document, keyed by id, for lookup + team scoping.
_DOCS = {}
for _c in _CANDIDATES:
    _DOCS[_c["id"]] = {**_c, "team": "hr"}
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
    """Team-scoped documents for the browser — neutral (no safe/attack hints)."""
    if team == "hr":
        groups = []
        for pid, pos in POSITIONS.items():
            docs = [
                {"id": c["id"], "label": c["label"], **_file_meta(c["file"])}
                for c in _CANDIDATES if c["position"] == pid
            ]
            if docs:
                groups.append({
                    "id": pid, "title": pos["title"], "department": pos["department"],
                    "requirements": pos["requirements"], "docs": docs,
                })
        return {"mode": "grouped", "groups": groups}

    if team == "legal":
        docs = [{"id": a["id"], "label": a["label"], "sub": a["sub"], **_file_meta(a["file"])}
                for a in _AGREEMENTS]
        return {"mode": "list", "docs": docs}

    if team == "finance":
        docs = [{"id": i["id"], "label": i["label"], "sub": i["sub"], **_file_meta(i["file"])}
                for i in _INVOICES]
        return {"mode": "list", "docs": docs}

    return {"mode": "list", "docs": []}


def resolve_document(item_id: str, team: str):
    """Return (doc, absolute_path) if item_id exists and belongs to team, else (None, None)."""
    doc = _DOCS.get(item_id)
    if not doc or doc["team"] != team:
        return None, None
    return doc, os.path.join(_SAMPLES_DIR, doc["file"])


def downstream_task(doc: dict) -> tuple:
    """(request, context, source_label) — the role-tailored task for the assistant."""
    team = doc["team"]
    if team == "hr":
        pos = POSITIONS[doc["position"]]
        reqs = "\n".join("- " + r for r in pos["requirements"])
        request = (
            f"Assess this candidate for the {pos['title']} position. State the overall fit "
            "as Strong, Partial, or Weak; list which requirements are clearly met and which "
            "are missing or unclear; then give a one-line recommendation. Judge only from the "
            "résumé."
        )
        context = f"{pos['title']} ({pos['department']}) — key requirements:\n{reqs}"
        source = f"{doc['label']} — {pos['title']}"
        return request, context, source

    if team == "legal":
        request = (
            "Review this agreement for a busy non-lawyer. Briefly cover: the parties, each "
            "side's main obligations, fees, the term and termination notice, and flag any "
            "clause that deserves a closer legal look. Plain language."
        )
        return request, None, f"{doc['label']} — {doc['sub']}"

    if team == "finance":
        request = (
            "Extract the key details from this invoice for accounts payable: vendor, invoice "
            "number, date, line items, subtotal, tax, total, and payment terms/due date. Note "
            "any figure that does not add up."
        )
        return request, None, f"{doc['label']} — {doc['sub']}"

    return "Summarise the key points of this document.", None, doc.get("label", "Document")
