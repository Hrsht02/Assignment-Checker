"""
Semantic similarity detection using Sentence Transformers + FAISS.
"""
from __future__ import annotations
import hashlib
import numpy as np
from typing import Optional


_model = None


def _get_model():
    global _model
    if _model is None:
        from sentence_transformers import SentenceTransformer
        _model = SentenceTransformer("all-MiniLM-L6-v2")
    return _model


def compute_embedding(text: str) -> np.ndarray:
    """Compute a sentence embedding for the given text."""
    model = _get_model()
    embedding = model.encode([text], normalize_embeddings=True)
    return embedding[0].astype(np.float32)


def compute_similarity(embedding1: np.ndarray, embedding2: np.ndarray) -> float:
    """Compute cosine similarity between two normalized embeddings."""
    # Since embeddings are normalized, dot product == cosine similarity
    return float(np.dot(embedding1, embedding2))


def find_most_similar(
    query_embedding: np.ndarray,
    stored_embeddings: list[np.ndarray],
    stored_ids: list[str],
) -> tuple[Optional[str], float]:
    """
    Find the most similar embedding from a list using FAISS.
    Returns (most_similar_id, similarity_score).
    """
    if not stored_embeddings:
        return None, 0.0

    try:
        import faiss

        d = query_embedding.shape[0]
        index = faiss.IndexFlatIP(d)  # Inner product (cosine with normalized vectors)

        matrix = np.stack(stored_embeddings).astype(np.float32)
        faiss.normalize_L2(matrix)
        index.add(matrix)

        query = query_embedding.reshape(1, -1).astype(np.float32)
        faiss.normalize_L2(query)

        distances, indices = index.search(query, 1)
        best_idx = int(indices[0][0])
        best_score = float(distances[0][0])

        return stored_ids[best_idx], best_score

    except ImportError:
        # Fallback to numpy if FAISS not available
        best_score = -1.0
        best_id = None
        for sid, emb in zip(stored_ids, stored_embeddings):
            score = compute_similarity(query_embedding, emb)
            if score > best_score:
                best_score = score
                best_id = sid
        return best_id, best_score


def is_exact_duplicate(content1: bytes, content2: bytes) -> bool:
    """Check if two files are byte-for-byte identical."""
    return hashlib.sha256(content1).hexdigest() == hashlib.sha256(content2).hexdigest()


def compute_text_hash(text: str) -> str:
    """Compute SHA-256 hash of extracted text (normalized)."""
    normalized = " ".join(text.lower().split())
    return hashlib.sha256(normalized.encode()).hexdigest()
