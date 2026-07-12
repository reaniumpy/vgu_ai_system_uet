"""
Real ML-based prompt-injection guardrail.

Loads protectai/deberta-v3-base-prompt-injection-v2 (a DeBERTa-v3 model
fine-tuned to classify text as INJECTION vs SAFE) and uses it to scan
external content before it reaches the target LLM.

Model card: https://huggingface.co/protectai/deberta-v3-base-prompt-injection-v2
"""

import os
import threading
from dataclasses import dataclass

# Must be set before torch/transformers get imported (below, lazily, inside
# _get_classifier): on CPU-constrained hosts like Streamlit Community
# Cloud's free tier, PyTorch's default multi-threaded OpenMP/MKL BLAS
# execution -- and HuggingFace tokenizers' own thread pool -- can segfault
# the whole process on the very first inference call instead of failing
# cleanly, if the host has fewer usable cores than PyTorch assumes. Forcing
# single-threaded execution is the standard fix for exactly this failure
# signature (works fine locally, segfaults on the constrained host, no
# Python traceback -- the crash happens below the interpreter).
os.environ.setdefault("OMP_NUM_THREADS", "1")
os.environ.setdefault("MKL_NUM_THREADS", "1")
os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")

MODEL_NAME = "protectai/deberta-v3-base-prompt-injection-v2"

_classifier = None
_classifier_lock = threading.Lock()


def _get_classifier():
    global _classifier
    if _classifier is None:
        with _classifier_lock:
            if _classifier is None:  # re-check: another thread may have won the race
                import torch
                from transformers import pipeline

                torch.set_num_threads(1)
                _classifier = pipeline("text-classification", model=MODEL_NAME)
    return _classifier


@dataclass
class GuardrailResult:
    label: str
    score: float
    flagged_text: str

    @property
    def blocked(self) -> bool:
        return self.label == "INJECTION"

    @property
    def malicious_probability(self) -> float:
        """Probability (0-1) that this text is malicious, regardless of
        which label the classifier assigned -- lets callers show a
        consistent risk percentage even when the verdict is SAFE."""
        return self.score if self.label == "INJECTION" else 1 - self.score


def check(text: str, chunk_size: int = 60, stride: int = 30) -> GuardrailResult:
    """Scan text for prompt injection.

    A short attack sentence buried inside a long, mostly-benign document
    (e.g. one line hidden in a full resume) can get diluted by the
    classifier's whole-sequence pooling and score as SAFE, even though
    that same sentence alone scores as a confident INJECTION. To catch
    this, scan in overlapping word windows and flag the whole text if
    any window trips the detector -- the same chunked-scanning approach
    real content-scanning guardrails use on long documents.

    The winning chunk's own text is returned as flagged_text, so callers
    can show end users and admins exactly what looked like a hidden
    instruction, not just a label and a score.
    """
    clf = _get_classifier()
    words = text.split()

    if len(words) <= chunk_size:
        chunks = [text]
    else:
        chunks = []
        step = chunk_size - stride
        for start in range(0, len(words), step):
            chunks.append(" ".join(words[start : start + chunk_size]))
            if start + chunk_size >= len(words):
                break

    scored = [(chunk, clf(chunk, truncation=True)[0]) for chunk in chunks]
    injections = [(chunk, r) for chunk, r in scored if r["label"] == "INJECTION"]
    chunk, worst = (
        max(injections, key=lambda cr: cr[1]["score"])
        if injections
        else min(scored, key=lambda cr: cr[1]["score"])
    )
    return GuardrailResult(label=worst["label"], score=worst["score"], flagged_text=chunk)
