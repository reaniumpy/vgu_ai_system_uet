"""Download the prompt-injection classifier into the image at build time.

Baking the weights into the image means the container needs no internet at
runtime: it starts fast and the guard works fully offline. Kept in sync with
``app.config.MODEL_ID``.
"""

import os

os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")

from transformers import AutoModelForSequenceClassification, AutoTokenizer

MODEL_ID = os.environ.get("CORTIS_MODEL_ID", "protectai/deberta-v3-base-prompt-injection-v2")


def main() -> None:
    print(f"Downloading detection model: {MODEL_ID}")
    AutoTokenizer.from_pretrained(MODEL_ID)
    AutoModelForSequenceClassification.from_pretrained(MODEL_ID)
    print("Detection model cached in image.")


if __name__ == "__main__":
    main()
