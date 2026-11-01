import numpy as np
import pytest

from app.core.embeddings import (
    SIMILARITY_CEILING,
    SIMILARITY_FLOOR,
    calibrate,
    chunk_text,
    embed_text,
    get_embedder,
    normalize_rows,
    semantic_similarity,
)


def unit(*values: float) -> np.ndarray:
    return normalize_rows(np.array([values], dtype=np.float32))


def test_chunk_text_overlapping_windows():
    words = [f"w{i}" for i in range(10)]
    chunks = chunk_text(" ".join(words), size=4, overlap=1)
    assert chunks == ["w0 w1 w2 w3", "w3 w4 w5 w6", "w6 w7 w8 w9"]


def test_chunk_text_short_and_empty():
    assert chunk_text("just a few words", size=150, overlap=30) == ["just a few words"]
    assert chunk_text("   ") == []


def test_semantic_similarity_uses_best_chunks():
    jd = unit(1, 0)
    resume = np.vstack([unit(1, 0), unit(0, 1), unit(0, 1)])
    assert semantic_similarity(jd, resume, top_k=1) == pytest.approx(1.0)
    assert semantic_similarity(jd, resume, top_k=3) == pytest.approx(1 / 3)


def test_semantic_similarity_compares_against_jd_centroid():
    jd = np.vstack([unit(1, 0), unit(0, 1)])
    assert semantic_similarity(jd, unit(1, 1)) == pytest.approx(1.0)


def test_semantic_similarity_empty_inputs():
    empty = np.zeros((0, 0), dtype=np.float32)
    assert semantic_similarity(empty, unit(1, 0)) == 0.0
    assert semantic_similarity(unit(1, 0), empty) == 0.0


def test_calibrate_maps_band_to_unit_interval():
    assert calibrate(SIMILARITY_FLOOR) == 0.0
    assert calibrate(SIMILARITY_CEILING) == 1.0
    assert calibrate((SIMILARITY_FLOOR + SIMILARITY_CEILING) / 2) == pytest.approx(0.5)
    assert calibrate(0.1) == 0.0
    assert calibrate(0.99) == 1.0


def test_real_model_returns_normalized_vectors():
    vectors = embed_text("Python backend developer", get_embedder())
    assert vectors.shape == (1, 384)
    assert np.linalg.norm(vectors[0]) == pytest.approx(1.0, abs=1e-5)


def test_real_model_ranks_by_meaning_not_wording(jd_text, resume_texts):
    embedder = get_embedder()
    jd = embed_text(jd_text, embedder)
    scores = {name: semantic_similarity(jd, embed_text(text, embedder)) for name, text in resume_texts.items()}

    # The "synonym" resume shares almost no keywords with the JD but describes the same work.
    assert scores["strong"] > scores["synonym"] > scores["weak"]
    assert scores["synonym"] > scores["unrelated"]
    assert calibrate(scores["synonym"]) > 0.4
    assert calibrate(scores["unrelated"]) < 0.1
