from app.scoring import extract_keywords, match_score

JD = "Python developer. Python, Django and AWS required. Docker is a plus. CI/CD with GitHub Actions."


def test_keywords_skip_stopwords_and_keep_tech_tokens():
    terms = dict(extract_keywords(JD))
    assert terms["python"] == 2
    assert "ci/cd" in terms
    assert "required" not in terms and "and" not in terms


def test_match_score_rewards_coverage():
    assert match_score(JD, "") == 0
    partial = match_score(JD, "I write Python.")
    full = match_score(JD, "Python Django AWS Docker CI/CD GitHub Actions developer")
    assert 0 < partial < full == 100


def test_match_requires_whole_word():
    assert match_score("java java java", "javascript") == 0
