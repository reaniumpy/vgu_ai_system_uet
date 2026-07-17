"""Central settings and thread pinning.

Importing this module first (which ``guard`` and ``main`` do) guarantees the
single-thread environment is set before torch/tokenizers are imported.
"""

import os

# Keep the ML stack single-threaded for predictable, crash-free behaviour on the
# tiny inputs the guard sees. Set before torch/transformers import.
os.environ.setdefault("OMP_NUM_THREADS", "1")
os.environ.setdefault("MKL_NUM_THREADS", "1")
os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")

# The off-the-shelf DeBERTa-v3 prompt-injection classifier.
MODEL_ID = os.environ.get("CORTIS_MODEL_ID", "protectai/deberta-v3-base-prompt-injection-v2")

# A document is BLOCKED when the model's injection probability on any segment
# reaches this. 0.5 = the model's own decision boundary; the classifier is
# well-calibrated and confident, so 0.5 keeps false positives low.
BLOCK_THRESHOLD = float(os.environ.get("CORTIS_BLOCK_THRESHOLD", "0.5"))

# The classifier judges whether a *passage* is an injection, so a short attack
# hidden in a long benign document gets diluted if scored whole. We therefore
# scan the document in small segments (paragraphs, plus overlapping word windows
# for walls of text) and block if ANY segment looks like an injection.
SEGMENT_MAX_TOKENS = 512          # per-segment tokenizer cap (DeBERTa limit)
WINDOW_WORDS = 60                 # sliding word-window size
WINDOW_WORD_STRIDE = 40           # step between word windows
MIN_SEGMENT_WORDS = 2             # skip 1-word fragments (e.g. a bare "INVOICE"
                                  # title) — no context, so the model scores them
                                  # spuriously; they're still covered by the
                                  # sliding word windows with surrounding context.
MAX_SEGMENTS = 120                # bound work on very large inputs
BATCH_SIZE = 16                   # segments per forward pass

# Downstream assistant (SAFE path only) — OpenAI / ChatGPT.
ASSISTANT_MODEL = os.environ.get("CORTIS_ASSISTANT_MODEL", "gpt-4o-mini")
ASSISTANT_MAX_TOKENS = int(os.environ.get("CORTIS_ASSISTANT_MAX_TOKENS", "1200"))

# Teams a user can tag a check with — powers the admin "trends by team" view.
TEAMS = ["Human Resources", "Legal", "Finance", "Operations"]

# Where the activity log lives (mounted or in-container).
LOG_PATH = os.environ.get("CORTIS_LOG_PATH", "/app/data/activity.jsonl")

# Uploaded files larger than this are rejected with a friendly message.
MAX_UPLOAD_BYTES = int(os.environ.get("CORTIS_MAX_UPLOAD_BYTES", str(5 * 1024 * 1024)))
