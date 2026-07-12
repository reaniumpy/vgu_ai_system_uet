# Prompt Injection Demo

A CLI and Streamlit app demonstrating indirect prompt injection: hidden
instructions inside documents (email, resume, contract) or chat messages,
a real ML guardrail that detects them, and a real OpenAI-backed chat agent
with tool-calling you can try to hijack.

## Structure

```
demo.py               CLI entry point
app.py                Streamlit app (Scenario Tester / Chat / Admin tabs)
scenarios.py          Email, resume, and contract scenario definitions
guardrail.py          ML prompt-injection classifier (protectai/deberta-v3-base-prompt-injection-v2)
llm_client.py          OpenAI chat client for the Chat tab (tool-calling, override refusal)
agent_tools.py         Mock tool-calling backend for the Chat tab's agent
interview_log.py       Append-only logging for Scenario Tester runs and Chat turns
data/
  users.json           10 fake employee records (mock database)
  tools.json            Tool manifest for the Chat tab's agent
samples/
  sample_resume_2_*.pdf         Extra sample CVs (clean + hidden-injection) for the upload feature
  prompt_injection_techniques.txt   Educational reference of injection techniques
requirements.txt        Pinned dependencies
```

Logs write to `logs/` at runtime (gitignored, not committed).

## Setup

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
```

Optional environment variables (set as env vars, or in `.streamlit/secrets.toml`):

| Variable | Purpose |
|---|---|
| `OPENAI_API_KEY` | Lets the Chat tab call OpenAI without prompting for a key each session. |
| `ADMIN_PASSWORD` | Protects the Admin tab (defaults to `changeme-demo` — override before sharing). |

## Run locally

```bash
python demo.py --scenario {email,resume,contract}   # CLI
streamlit run app.py                                 # Web app
```

## Deploy (Streamlit Community Cloud)

1. Push this repo to GitHub (public or private).
2. Go to [share.streamlit.io](https://share.streamlit.io), sign in, and create a new app pointing at this repo, branch `main`, main file `app.py`.
3. In **Advanced settings**, set the Python version to match `requirements.txt`'s pins (3.9–3.10 recommended).
4. Under the app's **Settings → Secrets**, set `OPENAI_API_KEY` and `ADMIN_PASSWORD`.
5. Deploy. If it ever crashes, use **Manage app → Reboot app** to force a clean restart.
