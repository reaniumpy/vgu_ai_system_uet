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


def check(text: str) -> GuardrailResult:
    clf = _get_classifier()
    result = clf(text, truncation=True)[0]
    return GuardrailResult(label=result["label"], score=result["score"])
