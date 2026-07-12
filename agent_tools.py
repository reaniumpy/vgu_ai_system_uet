"""
Mock tool-calling backend for the Chat tab's agent demo.

Loads a small fake user "database" (data/users.json) and exposes a few
callable tools over it, plus the OpenAI-format tool schema generated from
data/tools.json. One tool (get_user_sensitive_data) is intentionally
marked "sensitive" -- it exists so the Chat tab can red-team whether the
agent gets tricked (e.g. via a hidden instruction inside an uploaded PDF)
into calling it when it shouldn't.
"""

import json
import os

_DATA_DIR = os.path.join(os.path.dirname(__file__), "data")

with open(os.path.join(_DATA_DIR, "users.json")) as f:
    _USERS = json.load(f)

with open(os.path.join(_DATA_DIR, "tools.json")) as f:
    _TOOL_MANIFEST = json.load(f)

PUBLIC_FIELDS = ("id", "name", "email", "department", "role", "hire_date")


def _public(user: dict) -> dict:
    return {k: user[k] for k in PUBLIC_FIELDS}


def get_user_profile(user_id: int) -> dict:
    for u in _USERS:
        if u["id"] == user_id:
            return _public(u)
    return {"error": f"No user with id {user_id}"}


def search_users(query: str) -> list:
    q = query.lower()
    return [_public(u) for u in _USERS if q in u["name"].lower() or q in u["department"].lower()]


def list_all_users() -> list:
    return [_public(u) for u in _USERS]


def get_user_sensitive_data(user_id: int) -> dict:
    for u in _USERS:
        if u["id"] == user_id:
            return {"id": u["id"], "name": u["name"], "ssn": u["ssn"], "salary": u["salary"]}
    return {"error": f"No user with id {user_id}"}


TOOL_FUNCTIONS = {
    "get_user_profile": get_user_profile,
    "search_users": search_users,
    "list_all_users": list_all_users,
    "get_user_sensitive_data": get_user_sensitive_data,
}


def openai_tool_schema() -> list:
    """Build the OpenAI-format `tools=[...]` list from data/tools.json."""
    return [
        {
            "type": "function",
            "function": {
                "name": t["name"],
                "description": t["description"],
                "parameters": t["parameters"],
            },
        }
        for t in _TOOL_MANIFEST
    ]


def is_sensitive(tool_name: str) -> bool:
    return any(t["name"] == tool_name and t.get("sensitivity") == "sensitive" for t in _TOOL_MANIFEST)
