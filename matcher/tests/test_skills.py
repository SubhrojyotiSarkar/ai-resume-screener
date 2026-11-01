from collections import defaultdict

import pytest

from app.core.skills import SkillMatcher, get_skill_matcher, load_skills, normalize, tokenize


@pytest.fixture(scope="module")
def matcher() -> SkillMatcher:
    return get_skill_matcher()


def test_dictionary_has_about_150_skills_and_no_alias_maps_to_two_skills():
    skills = load_skills()
    assert len(skills) >= 140
    owners = defaultdict(set)
    for canonical, aliases in skills.items():
        for alias in aliases:
            owners[normalize(alias)].add(canonical)
    assert {alias: names for alias, names in owners.items() if len(names) > 1} == {}


def test_tokenize_keeps_symbol_skills_whole():
    assert tokenize("C++, C#, Node.js and ASP.NET.") == ["c++", "c#", "node.js", "and", "asp.net"]


def test_tokenize_splits_on_hyphens_and_slashes():
    assert tokenize("CI/CD with scikit-learn") == ["ci", "cd", "with", "scikit", "learn"]


def test_aliases_map_to_canonical_names(matcher):
    text = "Built ML models in Python3 and a JS frontend with ReactJS on k8s."
    assert matcher.extract(text) == ["javascript", "kubernetes", "machine learning", "python", "react"]


def test_multi_word_skills_are_matched(matcher):
    text = "Experience with natural language processing, Spring Boot and Amazon Web Services."
    assert {"nlp", "spring boot", "aws"} <= set(matcher.extract(text))


def test_word_boundaries_prevent_partial_matches(matcher):
    assert matcher.extract("JavaScript developer") == ["javascript"]  # not "java"
    assert matcher.extract("Experienced in Node.js") == ["node.js"]  # not "javascript" via "js"


def test_symbol_skills_and_trailing_punctuation(matcher):
    assert matcher.extract("Wrote C++ and C# services. Also Python.") == ["c#", "c++", "python"]


def test_ambiguous_bare_words_are_not_extracted(matcher):
    # "go", "express" and "c" are real skills but also common words.
    assert matcher.extract("Ready to go the extra mile, express ideas, grade C.") == []
    assert matcher.extract("Backend services in Golang") == ["go"]


def test_extraction_is_case_insensitive_and_deduplicated(matcher):
    assert matcher.extract("PostgreSQL, postgres, POSTGRESQL") == ["postgresql"]


def test_canonicalize(matcher):
    assert matcher.canonicalize("ReactJS") == "react"
    assert matcher.canonicalize("Go") == "go"  # canonical name, even though not an alias
    assert matcher.canonicalize("Figma Plugins") == "figma plugins"  # unknown: normalized


def test_custom_dictionary():
    custom = SkillMatcher({"machine learning": ["ml", "machine learning"]})
    assert custom.extract("I like machine learning") == ["machine learning"]
    assert custom.extract("I like machines") == []
