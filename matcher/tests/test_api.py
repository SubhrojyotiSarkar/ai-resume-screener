from bson import ObjectId

from tests.helpers import make_docx, make_pdf

PDF_MIME = "application/pdf"
DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"


def upload(client, headers, filename, data, mime):
    return client.post("/parse", headers=headers, files={"file": (filename, data, mime)})


def test_health_needs_no_key(client):
    assert client.get("/health").json() == {"status": "ok", "service": "matcher"}


def test_parse_and_score_require_internal_key(client):
    assert client.post("/parse").status_code == 401
    assert client.post("/score", headers={"X-Internal-Key": "wrong"}, json={}).status_code == 401


def test_parse_pdf_stores_document(client, auth_headers, repository, resume_texts):
    response = upload(client, auth_headers, "priya.pdf", make_pdf(resume_texts["strong"]), PDF_MIME)

    assert response.status_code == 201
    body = response.json()
    assert set(body) == {"mongo_id", "skills", "email", "name_guess"}
    assert body["email"] == "priya.sharma@example.com"
    assert body["name_guess"] == "Priya Sharma"
    assert "fastapi" in body["skills"]

    stored = repository.documents[body["mongo_id"]]
    assert stored["phone"] == "+91 98765 43210"
    assert stored["parsed_at"].tzinfo is not None


def test_parse_docx(client, auth_headers, resume_texts):
    response = upload(client, auth_headers, "rahul.docx", make_docx(resume_texts["partial"]), DOCX_MIME)
    assert response.status_code == 201
    assert response.json()["name_guess"] == "Rahul Verma"


def test_parse_rejects_unsupported_type(client, auth_headers):
    response = upload(client, auth_headers, "notes.txt", b"plain text resume", "text/plain")
    assert response.status_code == 400
    assert "PDF and DOCX" in response.json()["detail"]


def test_parse_rejects_empty_and_unreadable_files(client, auth_headers):
    assert upload(client, auth_headers, "empty.pdf", b"", PDF_MIME).status_code == 400
    assert upload(client, auth_headers, "scan.pdf", make_pdf(""), PDF_MIME).status_code == 422


def test_parse_rejects_files_over_5mb(client, auth_headers):
    big = b"%PDF-1.4\n" + b"0" * (5 * 1024 * 1024)
    assert upload(client, auth_headers, "big.pdf", big, PDF_MIME).status_code == 413


def test_score_ranks_uploaded_resumes(client, auth_headers, jd_text, resume_texts):
    ids = {
        name: upload(client, auth_headers, f"{name}.pdf", make_pdf(text), PDF_MIME).json()["mongo_id"]
        for name, text in resume_texts.items()
    }

    response = client.post(
        "/score",
        headers=auth_headers,
        json={
            "job_description": jd_text,
            "required_skills": ["python", "react", "postgresql"],
            "resume_ids": [ids["weak"], ids["strong"], ids["partial"]],
        },
    )

    assert response.status_code == 200
    results = response.json()
    assert [r["resume_id"] for r in results] == [ids["weak"], ids["strong"], ids["partial"]]
    scores = {r["resume_id"]: r["match_score"] for r in results}
    assert scores[ids["strong"]] > scores[ids["partial"]] > scores[ids["weak"]]
    assert set(results[0]) == {
        "resume_id",
        "match_score",
        "text_score",
        "skill_score",
        "semantic_score",
        "lexical_score",
        "matched_skills",
        "missing_skills",
    }


def test_score_reuses_embeddings_stored_at_parse_time(client, auth_headers, repository, resume_texts):
    mongo_id = upload(client, auth_headers, "s.pdf", make_pdf(resume_texts["strong"]), PDF_MIME).json()["mongo_id"]
    body = {"job_description": "Python developer", "resume_ids": [mongo_id]}
    original = client.post("/score", headers=auth_headers, json=body).json()[0]["semantic_score"]

    # Vectors from another model must be ignored and recomputed.
    repository.documents[mongo_id]["embedding"]["model"] = "some-old-model"
    repository.documents[mongo_id]["embedding"]["vectors"] = [[0.0] * 384]
    assert client.post("/score", headers=auth_headers, json=body).json()[0]["semantic_score"] == original


def test_score_unknown_resume_returns_404(client, auth_headers):
    unknown = str(ObjectId())
    response = client.post(
        "/score", headers=auth_headers, json={"job_description": "Python dev", "resume_ids": [unknown]}
    )
    assert response.status_code == 404
    assert unknown in response.json()["detail"]


def test_score_validates_body(client, auth_headers):
    bad_id = client.post("/score", headers=auth_headers, json={"job_description": "x", "resume_ids": ["nope"]})
    blank_jd = client.post(
        "/score", headers=auth_headers, json={"job_description": "  ", "resume_ids": [str(ObjectId())]}
    )
    no_ids = client.post("/score", headers=auth_headers, json={"job_description": "x", "resume_ids": []})
    assert bad_id.status_code == blank_jd.status_code == no_ids.status_code == 422


def test_delete_resumes(client, auth_headers, repository, resume_texts):
    mongo_id = upload(client, auth_headers, "w.pdf", make_pdf(resume_texts["weak"]), PDF_MIME).json()["mongo_id"]
    unknown = str(ObjectId())

    response = client.post("/resumes/delete", headers=auth_headers, json={"resume_ids": [mongo_id, unknown]})

    assert response.status_code == 200
    assert response.json() == {"deleted": 1}
    assert mongo_id not in repository.documents
    assert client.post("/resumes/delete", json={"resume_ids": [unknown]}).status_code == 401
    assert client.post("/resumes/delete", headers=auth_headers, json={"resume_ids": ["bad"]}).status_code == 422
