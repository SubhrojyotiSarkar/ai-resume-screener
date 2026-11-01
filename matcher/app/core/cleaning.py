"""Text normalization for TF-IDF: lowercase, drop stopwords and punctuation, lemmatize."""

import re
from functools import lru_cache

import spacy
from spacy.language import Language

SPACY_MODEL = "en_core_web_sm"
# spaCy's default limit is 1M chars; resumes are far smaller, so cap to bound CPU use.
MAX_CHARS = 100_000

_NON_WORD_RE = re.compile(r"[^a-z0-9+#]")


@lru_cache(maxsize=1)
def get_nlp() -> Language:
    # The parser and NER are not needed for lemmatization, and skipping them makes it ~2x faster.
    return spacy.load(SPACY_MODEL, disable=["parser", "ner"])


def clean_text(text: str) -> str:
    doc = get_nlp()(text[:MAX_CHARS].lower())
    tokens = []
    for token in doc:
        if token.is_stop or token.is_punct or token.is_space or token.like_email or token.like_url:
            continue
        lemma = _NON_WORD_RE.sub("", token.lemma_.lower())
        if lemma:
            tokens.append(lemma)
    return " ".join(tokens)
