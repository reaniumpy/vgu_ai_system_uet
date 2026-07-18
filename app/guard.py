"""The detection engine: classify untrusted text and explain the result plainly.

The model's job is Detect + Decide (SAFE vs INJECTION). A thin, rule-based layer
turns that raw signal into a plain-language verdict a non-technical person can act
on — and tags the *kind* of attack purely to word the explanation, never to make
the decision.
"""

import re
import threading
from typing import Optional

from . import config  # sets single-thread env before torch imports

import torch
import torch.nn.functional as F
from transformers import AutoModelForSequenceClassification, AutoTokenizer

torch.set_num_threads(1)

_LOCK = threading.Lock()
_tokenizer = None
_model = None


def _load():
    """Load the classifier once, lazily, in a thread-safe way."""
    global _tokenizer, _model
    if _model is not None:
        return _tokenizer, _model
    with _LOCK:
        if _model is None:
            tok = AutoTokenizer.from_pretrained(config.MODEL_ID)
            mdl = AutoModelForSequenceClassification.from_pretrained(config.MODEL_ID)
            mdl.eval()
            _tokenizer, _model = tok, mdl
    return _tokenizer, _model


def warmup() -> None:
    """Load the model ahead of the first user request (called at startup)."""
    _load()


# ── Intent tagging (explanation wording only) ────────────────────────────────
# Ordered most-specific first. Each entry: (category, keyword regex).
_INTENT_PATTERNS = [
    (
        "data_deletion",
        re.compile(
            r"\b(delete|remove|erase|wipe|drop|destroy|purge)\b.{0,40}"
            r"\b(record|records|profile|profiles|database|table|file|files|account|data|row|entry)\b",
            re.I | re.S,
        ),
    ),
    (
        "data_exfiltration",
        re.compile(
            r"\b(send|email|e-mail|forward|upload|post|leak|exfiltrat\w*|transmit|share)\b.{0,60}"
            r"\b(api key|api-key|apikey|password|passwords|credential|credentials|payroll|salary|"
            r"ssn|social security|confidential|secret|secrets|private|external|outside|@)\b",
            re.I | re.S,
        ),
    ),
    (
        "instruction_override",
        re.compile(
            r"\b(ignore|disregard|forget|override|bypass|do not follow|skip)\b.{0,40}"
            r"\b(previous|prior|above|earlier|all|any|these|the|further)\b.{0,25}"
            r"\b(instruction|instructions|rules|prompt|prompts|guidelines?|directions?|"
            r"criteria|checks?|evaluation|screening|steps|process)\b",
            re.I | re.S,
        ),
    ),
    (
        "role_manipulation",
        re.compile(
            r"("
            r"\byou are now\b|\bact as\b|\bpretend to be\b|\bdeveloper mode\b|"
            r"\bsystem prompt\b|\breveal your\b|\bdisregard your\b|\byour (new )?instructions? (are|is)\b|"
            r"\bsystem (instruction|note|update)\b|\bnote to (the )?(reviewing )?ai\b|"
            r"\battention[,: ]+ai\b|\bai assistant:\b|"
            r"\bjailbreak\b|\bDAN\b"
            r")",
            re.I | re.S,
        ),
    ),
]

# Plain-language narrative per category. No scores, labels, or model internals.
_NARRATIVES = {
    "data_deletion": {
        "label": "Attempt to delete data",
        "explanation": (
            "This document hides an instruction telling the AI assistant to delete "
            "records or files. That is not a normal request — a document should never "
            "tell the assistant to erase your data."
        ),
    },
    "data_exfiltration": {
        "label": "Attempt to leak private information",
        "explanation": (
            "This document hides an instruction telling the AI assistant to send private "
            "information — such as passwords, payroll, or confidential data — to an outside "
            "address. A normal document would never ask for that."
        ),
    },
    "instruction_override": {
        "label": "Attempt to override the assistant",
        "explanation": (
            "This document hides an instruction telling the AI assistant to ignore its own "
            "rules and do something else instead. That is a sign someone is trying to take "
            "control of the assistant through the document."
        ),
    },
    "role_manipulation": {
        "label": "Attempt to change the assistant's behaviour",
        "explanation": (
            "This document hides an instruction trying to change how the AI assistant "
            "behaves or to make it reveal its private settings. A normal document would not "
            "contain instructions aimed at the assistant."
        ),
    },
    "generic": {
        "label": "Hidden instruction found",
        "explanation": (
            "This document contains hidden instructions aimed at the AI assistant rather "
            "than at you. That is how a prompt-injection attack tries to hijack the assistant, "
            "so cortis stopped the document before it reached it."
        ),
    },
}

_BLOCKED_NEXT_STEP = (
    "Do not use this document with the AI assistant. If you trust the sender, ask them to "
    "resend a clean copy; otherwise report it to your IT or security team. Your other "
    "documents are unaffected — you can safely carry on with them."
)

_SAFE_HEADLINE = "Safe to use"
_SAFE_EXPLANATION = (
    "cortis checked this document for hidden instructions and found none. It is safe to send "
    "to the AI assistant."
)


def _tag_intent(text: str):
    """Return (category, match) — the first intent pattern that fires, and where.

    ``match`` (or None for 'generic') lets the caller show the exact passage that
    justifies the category, instead of whatever segment the model scored highest.
    """
    for category, pattern in _INTENT_PATTERNS:
        m = pattern.search(text)
        if m:
            return category, m
    return "generic", None


def _excerpt_for_match(text: str, m: "re.Match", limit: int = 240) -> Optional[str]:
    """The passage that matched an intent pattern — the plain-language 'evidence'.

    Expand to the blank-line-delimited paragraph containing the match so the user
    sees the whole hidden instruction; if that paragraph runs longer than ``limit``,
    return a window centred on the match so the instruction itself stays visible.
    """
    para_start = 0
    for bm in re.finditer(r"\n\s*\n", text[: m.start()]):
        para_start = bm.end()
    nm = re.search(r"\n\s*\n", text[m.end():])
    para_end = m.end() + nm.start() if nm else len(text)
    para = re.sub(r"\s+", " ", text[para_start:para_end].strip())
    if len(para) <= limit:
        return para or None
    pad = max(0, (limit - (m.end() - m.start())) // 2)
    ws = max(para_start, m.start() - pad)
    we = min(para_end, m.end() + pad)
    frag = text[ws:we]
    if ws > para_start:  # snap off a partial leading word
        frag = frag[frag.find(" ") + 1:] if " " in frag else frag
    if we < para_end:  # snap off a partial trailing word
        frag = frag[: frag.rfind(" ")] if " " in frag else frag
    frag = re.sub(r"\s+", " ", frag.strip())
    return ("…" if ws > para_start else "") + frag + ("…" if we < para_end else "")


def _segments(text: str) -> list:
    """Break text into small passages to score independently.

    Paragraphs (blank-line separated) catch injections that sit in their own
    block; overlapping word windows catch injections buried in a wall of text
    with no paragraph breaks. Scoring these small passages — rather than the
    whole document — is what keeps a short hidden instruction from being diluted.
    """
    segments: list = []
    seen = set()

    def add(passage: str) -> None:
        passage = passage.strip()
        if len(passage.split()) < config.MIN_SEGMENT_WORDS:
            return
        key = passage[:300]
        if key in seen:
            return
        seen.add(key)
        segments.append(passage)

    for paragraph in re.split(r"\n\s*\n", text):
        add(paragraph)

    words = text.split()
    if len(words) > config.WINDOW_WORDS:
        for start in range(0, len(words), config.WINDOW_WORD_STRIDE):
            add(" ".join(words[start : start + config.WINDOW_WORDS]))
    else:
        add(text)

    return segments[: config.MAX_SEGMENTS]


def _scan(text: str):
    """Return (max_injection_prob, most_suspicious_segment) across all segments."""
    tok, mdl = _load()
    segments = _segments(text)
    if not segments:
        return 0.0, ""

    # Locate the INJECTION column from the model's own label map.
    inj_idx = {v.upper(): k for k, v in mdl.config.id2label.items()}.get("INJECTION", 1)

    max_prob = 0.0
    worst_text = segments[0]
    for start in range(0, len(segments), config.BATCH_SIZE):
        batch = segments[start : start + config.BATCH_SIZE]
        enc = tok(
            batch,
            max_length=config.SEGMENT_MAX_TOKENS,
            truncation=True,
            padding=True,
            return_tensors="pt",
        )
        with torch.no_grad():
            logits = mdl(**enc).logits
        inj_probs = F.softmax(logits, dim=-1)[:, inj_idx]
        local_worst = int(torch.argmax(inj_probs))
        local_max = float(inj_probs[local_worst])
        if local_max > max_prob:
            max_prob = local_max
            worst_text = batch[local_worst]

    return max_prob, worst_text


def check_text(text: str) -> dict:
    """Classify ``text`` and return a plain-language verdict.

    The ``verdict``/``headline``/``explanation``/``next_step`` fields are for the
    everyday user. ``category``/``confidence``/``matched_excerpt`` are technical
    detail for the monitoring view only — never shown as the primary message.
    """
    text = (text or "").strip()
    max_prob, worst_text = _scan(text)
    is_blocked = max_prob >= config.BLOCK_THRESHOLD

    if not is_blocked:
        return {
            "verdict": "safe",
            "headline": _SAFE_HEADLINE,
            "explanation": _SAFE_EXPLANATION,
            "next_step": None,
            "category": "none",
            "category_label": "No threat found",
            "confidence": round(max_prob, 4),
            "matched_excerpt": None,
        }

    category, match = _tag_intent(text)
    narrative = _NARRATIVES.get(category, _NARRATIVES["generic"])
    # Show the passage that justifies the category; for an uncategorised block,
    # fall back to whatever segment the model scored most suspicious.
    excerpt = _excerpt_for_match(text, match) if match else _short_excerpt(worst_text)
    return {
        "verdict": "blocked",
        "headline": "Blocked — this document tries to hijack the AI",
        "explanation": narrative["explanation"],
        "next_step": _BLOCKED_NEXT_STEP,
        "category": category,
        "category_label": narrative["label"],
        "confidence": round(max_prob, 4),
        "matched_excerpt": excerpt,
    }


def _short_excerpt(text: str, limit: int = 240) -> Optional[str]:
    text = re.sub(r"\s+", " ", (text or "").strip())
    if not text:
        return None
    return text if len(text) <= limit else text[:limit].rstrip() + "…"
