"""Skill extraction by matching token n-grams against a canonical skill dictionary.

`skills.json` maps a canonical skill name to its aliases. Both the aliases and
the input text go through the same `tokenize` function, so "CI/CD", "ci cd" and
"ci-cd" all become the n-gram "ci cd". Matching whole tokens gives word-boundary
behaviour for free: "java" never matches inside "javascript".
"""

import json
import re
from functools import lru_cache
from pathlib import Path

SKILLS_FILE = Path(__file__).resolve().parents[1] / "data" / "skills.json"

# A token starts with an optional "." (for ".net") and may contain + # . inside,
# so "c++", "c#", "node.js" and "asp.net" stay whole. Trailing dots are excluded
# so "python." at the end of a sentence still yields "python".
_TOKEN_RE = re.compile(r"(?<![a-z0-9])\.?[a-z0-9](?:[a-z0-9+#.]*[a-z0-9+#])?")


def tokenize(text: str) -> list[str]:
    """Lowercase and split text into skill-friendly tokens. Hyphens and slashes separate tokens."""
    return _TOKEN_RE.findall(text.lower().replace("-", " "))


def normalize(phrase: str) -> str:
    """Canonical string form of a phrase: its tokens joined by single spaces."""
    return " ".join(tokenize(phrase))


def ngrams(tokens: list[str], max_n: int) -> set[str]:
    """All space-joined n-grams of `tokens` for n in 1..max_n."""
    grams: set[str] = set()
    for n in range(1, max_n + 1):
        for i in range(len(tokens) - n + 1):
            grams.add(" ".join(tokens[i : i + n]))
    return grams


class SkillMatcher:
    """Extracts canonical skills from free text.

    The alias list is authoritative for extraction: the canonical name is *not*
    implicitly an alias, so ambiguous names like "go", "c" or "express" can be
    kept out of free-text matching (they'd match ordinary English words).
    """

    def __init__(self, skills: dict[str, list[str]]):
        self._canonical_by_key = {normalize(c): c for c in skills}
        self._alias_to_skill: dict[str, str] = {}
        for canonical, aliases in skills.items():
            for alias in aliases:
                key = normalize(alias)
                if key:
                    self._alias_to_skill[key] = canonical
        self._max_n = max((len(key.split()) for key in self._alias_to_skill), default=1)

    def extract(self, text: str) -> list[str]:
        """Return the sorted canonical skills mentioned in `text`."""
        grams = ngrams(tokenize(text), self._max_n)
        return sorted({skill for alias, skill in self._alias_to_skill.items() if alias in grams})

    def canonicalize(self, skill: str) -> str:
        """Map a skill name or alias to its canonical name; unknown skills are returned normalized."""
        key = normalize(skill)
        return self._alias_to_skill.get(key) or self._canonical_by_key.get(key) or key


def load_skills(path: Path = SKILLS_FILE) -> dict[str, list[str]]:
    with path.open(encoding="utf-8") as f:
        return json.load(f)


@lru_cache(maxsize=1)
def get_skill_matcher() -> SkillMatcher:
    return SkillMatcher(load_skills())
