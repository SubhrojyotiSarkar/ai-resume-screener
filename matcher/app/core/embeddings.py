"""Semantic similarity with sentence embeddings (BAAI/bge-small-en-v1.5 via fastembed/ONNX).

The model reads at most 512 tokens, so texts are split into overlapping word
windows and each window is embedded separately. A resume's similarity to a JD
is the mean of its best-matching chunks against the JD's centroid vector.

Raw cosine similarities from this model sit in a narrow band (unrelated English
text is already ~0.5), so `calibrate` stretches the useful range onto 0-1.
"""

from collections.abc import Callable
from functools import lru_cache

import numpy as np

MODEL_NAME = "BAAI/bge-small-en-v1.5"

CHUNK_WORDS = 150
CHUNK_OVERLAP = 30
TOP_K_CHUNKS = 3

# Measured on the test fixtures: unrelated resumes score ~0.50, strong matches ~0.83.
SIMILARITY_FLOOR = 0.50
SIMILARITY_CEILING = 0.85

# Maps a list of texts to an (n, dim) array of L2-normalized vectors.
Embedder = Callable[[list[str]], np.ndarray]


def normalize_rows(vectors: np.ndarray) -> np.ndarray:
    norms = np.linalg.norm(vectors, axis=1, keepdims=True)
    return vectors / np.where(norms == 0, 1, norms)


@lru_cache(maxsize=1)
def get_embedder() -> Embedder:
    # Imported lazily: loading onnxruntime is slow and unit tests may use a fake embedder.
    from fastembed import TextEmbedding

    model = TextEmbedding(MODEL_NAME)  # honours FASTEMBED_CACHE_PATH

    def embed(texts: list[str]) -> np.ndarray:
        return normalize_rows(np.array(list(model.embed(texts)), dtype=np.float32))

    return embed


def chunk_text(text: str, size: int = CHUNK_WORDS, overlap: int = CHUNK_OVERLAP) -> list[str]:
    """Split text into windows of `size` words that overlap by `overlap` words."""
    words = text.split()
    if not words:
        return []
    step = size - overlap
    return [" ".join(words[i : i + size]) for i in range(0, max(len(words) - overlap, 1), step)]


def embed_text(text: str, embedder: Embedder) -> np.ndarray:
    """Embed `text` as one vector per chunk; returns an empty (0, 0) array for blank text."""
    chunks = chunk_text(text)
    return embedder(chunks) if chunks else np.zeros((0, 0), dtype=np.float32)


def semantic_similarity(jd_vectors: np.ndarray, resume_vectors: np.ndarray, top_k: int = TOP_K_CHUNKS) -> float:
    """Mean cosine similarity of the resume's `top_k` best chunks to the JD centroid."""
    if jd_vectors.size == 0 or resume_vectors.size == 0:
        return 0.0
    centroid = normalize_rows(jd_vectors.mean(axis=0, keepdims=True))[0]
    similarities = np.sort(resume_vectors @ centroid)[::-1]
    return float(similarities[:top_k].mean())


def calibrate(similarity: float) -> float:
    """Linearly map raw cosine similarity from [FLOOR, CEILING] onto [0, 1], clipped."""
    scaled = (similarity - SIMILARITY_FLOOR) / (SIMILARITY_CEILING - SIMILARITY_FLOOR)
    return float(min(max(scaled, 0.0), 1.0))
