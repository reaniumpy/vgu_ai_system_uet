# Aegis — a prompt-injection guard (clean slate)

> Working codename: **cortis** (rename freely). This branch (`simple`) is a deliberate reset: the
> previous Streamlit implementation was scrapped so the product can be **designed fresh** and run on
> **Docker**, without inheriting the old UI. The old app is preserved on the `main` branch if ever
> needed. This file is the single source of truth for *what the product should achieve* — not how it
> should look.

---

## 0. Run it (Docker)

cortis is built as **cortis — "Document Safety Check"**: a FastAPI service that serves a
single, plain-language web UI. The detection engine is the off-the-shelf DeBERTa-v3
prompt-injection classifier (`protectai/deberta-v3-base-prompt-injection-v2`), baked into
the image so the container runs fully offline.

**One command to build & run:**

```bash
make run              # builds the image and starts it on http://localhost:8000
```

(or without make: `docker build -t cortis . && docker run -p 8000:8000 cortis`)

Then open **http://localhost:8000**. The first build downloads the model (~700 MB) into
the image; after that, start-up is a few seconds.

- **`/`** — the everyday check screen (Cohort A / non-technical users): paste text or pick a
  document from the built-in file browser, click **Check this document**, and get a plain
  **Safe** or **Blocked** answer.
- **`/admin`** — the monitoring screen (Cohort B / technical staff): recent checks, blocks
  by team, and what was blocked. Seeded with sample activity on first run so it isn't empty.

**Enabling the downstream AI assistant (optional).** On a *safe* document the app forwards
it to OpenAI/ChatGPT (`gpt-4o-mini` by default) to carry out the user's request (e.g.
summarise). Provide a key to turn this on — the guard itself works without one:

```bash
OPENAI_API_KEY=sk-... make run
```

Sample documents for usability tasks live in [`samples/`](samples/) — a mix of clean and
hidden-attack résumés, contracts, and invoices with neutral filenames (so a test participant
can't guess the answer from the name). The **Choose a file…** button in the app opens a
built-in browser limited to exactly these documents — it never touches the real filesystem.
Regenerate the PDF samples with `python scripts/build_sample_pdfs.py` (needs `fpdf2`).

---

## 1. The product goal (what it must achieve — deliberately UI-agnostic)

A guard that sits **in front of an LLM** and catches **prompt-injection** — hidden or malicious
instructions smuggled inside untrusted input (a document, a message, a pasted file) that try to
hijack the model. The product should:

1. **Detect** whether a given input contains a prompt-injection attempt (the model / engine's job).
2. **Decide** clearly: let it through, or block it.
3. **Explain the result to a non-expert** in plain language they can understand and act on —
   *without* exposing raw model internals (scores, labels, tensors) as the primary message.

The user is a **non-technical professional**, not an ML engineer. Success is measured by whether that
person can *use* the product and trust its answer — i.e. by **usability**, not by model accuracy
(model accuracy is a separate, technical question).

**Constraints:** runs on **Docker**; the framework/UI is an open design decision for the rebuild.

## 2. Day 4 objective (the course deliverable)

Course **61BIS515 — Usability Evaluation and Testing** (VGU). **Day 4 = submit a report and present
the findings of a usability-testing study.** So the product must be usable enough to run a real
usability test on it: recruit ~5 non-expert users, give them realistic goal-based tasks, observe them
via think-aloud, measure, and report findings + recommendations.

## 3. What the UET course teaches (method, condensed)

- **Usability = effectiveness · efficiency · satisfaction**, in a context of use (ISO 9241-11).
- **Method:** moderated, task-based testing with a **concurrent think-aloud** protocol; combine
  **quantitative** metrics (task-success rate, time-on-task, error rate) with **qualitative**
  observation, plus standardized post-test questionnaires (**SUS**; single-task ease via **SEQ**).
- **You only need ~5 users** per user group to surface most usability problems (Nielsen).
- **Personas** frame *who* you test with (user characteristics, goals, context of use); **tasks must
  be realistic, goal-oriented, and free of navigation hints** — describe *what the user wants to
  achieve, not how to do it*.
- **Analysis:** descriptive statistics (mean, median, range), compare against targets, never rely on
  a single metric, and end with **actionable recommendations**.

## 4. Quesenbery's 5 Es (usability *outcomes* to design for)

1. **Effective** — users can complete their goal correctly.
2. **Efficient** — they do it quickly, with little effort.
3. **Engaging** — the interface is pleasant and holds attention appropriately.
4. **Error-tolerant** — it prevents errors, and helps users recover when they happen.
5. **Easy to learn** — first-time and returning users get going without training.

## 5. Nielsen's 10 usability heuristics (design *rules* to check against)

1. **Visibility of system status** — always show what's happening.
2. **Match between system and the real world** — speak the user's language, not jargon.
3. **User control and freedom** — easy undo / exit; no dead ends.
4. **Consistency and standards** — follow platform and internal conventions.
5. **Error prevention** — stop problems before they happen.
6. **Recognition rather than recall** — make options visible; don't force memory.
7. **Flexibility and efficiency of use** — accelerators for experts, simple path for novices.
8. **Aesthetic and minimalist design** — no irrelevant clutter.
9. **Help users recognize, diagnose, and recover from errors** — plain-language, constructive messages.
10. **Help and documentation** — available and task-focused when needed.

## 6. Requirements

See `requirements.txt` — currently only the core detection-model dependencies. Extend it as the fresh
Docker design takes shape.

---

*Report note: the course runs an AI-content check on submitted reports — write report/presentation
prose in your own words.*
