"""
Interview-mode logging for the Streamlit app.

Only called when the app is in "Interview" mode (never in the default
"Testing" mode) -- see app.py's mode switch. Each entry records the full
input (assembled prompt) and output (guardrail verdict) of one Run, so an
interviewer/admin can audit exactly what was scanned and what the system
decided, without every casual testing session being logged.
"""

import json
import os
from datetime import datetime, timezone

LOG_PATH = "logs/interview_log.jsonl"


def log_interaction(entry: dict) -> dict:
    """Append one interaction to the local log file and return the entry
    (with its timestamp filled in) so the caller can offer it for download."""
    entry = {"timestamp": datetime.now(timezone.utc).isoformat(), **entry}
    os.makedirs(os.path.dirname(LOG_PATH), exist_ok=True)
    with open(LOG_PATH, "a") as f:
        f.write(json.dumps(entry) + "\n")
    return entry


def read_logs() -> list:
    """Read all logged interactions, oldest first. Empty list if none yet."""
    if not os.path.exists(LOG_PATH):
        return []
    with open(LOG_PATH) as f:
        return [json.loads(line) for line in f if line.strip()]
