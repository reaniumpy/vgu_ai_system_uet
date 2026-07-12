"""
Real ML-based prompt-injection guardrail.

Loads protectai/deberta-v3-base-prompt-injection-v2 (a DeBERTa-v3 model
fine-tuned to classify text as INJECTION vs SAFE) and uses it to scan
external content before it reaches the target LLM.

Model card: https://huggingface.co/protectai/deberta-v3-base-prompt-injection-v2
"""

from dataclasses import dataclass

MODEL_NAME = "protectai/deberta-v3-base-prompt-injection-v2"

_classifier = None


def _get_classifier():
    global _classifier
    if _classifier is None:
        from transformers import pipeline

        _classifier = pipeline("text-classification", model=MODEL_NAME)
    return _classifier


@dataclass
class GuardrailResult:
    label: str
    score: float

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

    results = [clf(chunk, truncation=True)[0] for chunk in chunks]
    injections = [r for r in results if r["label"] == "INJECTION"]
    worst = max(injections, key=lambda r: r["score"]) if injections else min(
        results, key=lambda r: r["score"]
    )
    return GuardrailResult(label=worst["label"], score=worst["score"])
