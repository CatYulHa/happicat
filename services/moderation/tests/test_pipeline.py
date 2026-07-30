"""파이프라인/병합 + Slack 알림 트리거 테스트 (가짜 LLM 주입, 네트워크 없음)."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app import main as main_module
from app.config import Settings
from app.pipeline import assess_checkin, assess_content, merge
from app.rules import evaluate_checkin, evaluate_content
from app.schemas import (
    AssessmentResponse,
    CheckinModerationRequest,
    ContentModerationRequest,
    GeoPoint,
    RiskAssessment,
)
from app.slack import build_payload

FIXTURES = Path(__file__).parent / "fixtures"


@pytest.fixture
def cfg() -> Settings:
    return Settings(_env_file=None, nvidia_api_key="", openai_api_key="", slack_webhook_url="")  # type: ignore[call-arg]


class FakeJudge:
    """LlmJudge 대역. 지정한 판정을 그대로 돌려준다."""

    def __init__(self, verdict: RiskAssessment | None) -> None:
        self.verdict = verdict
        self.calls: list[tuple[str, dict]] = []

    @property
    def enabled(self) -> bool:
        return self.verdict is not None

    def assess(self, kind: str, payload: dict, outcome) -> RiskAssessment | None:  # noqa: ANN001
        self.calls.append((kind, payload))
        return self.verdict


def load_fixture(name: str) -> dict:
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


# ─────────────────────────── 병합 규칙 ───────────────────────────


def test_merge_without_llm_uses_rules(cfg):
    req = CheckinModerationRequest(**load_fixture("fake_gps.json"))
    outcome = evaluate_checkin(req, cfg)
    merged, source = merge(outcome, None)

    assert source == "rules"
    assert merged.is_risk is True
    assert merged.risk_level == 5
    assert merged.suggested_action == "ban"


def test_llm_cannot_override_hard_fail(cfg):
    """반경 초과는 사실의 문제 — LLM이 무해하다고 해도 위험 판정이 유지된다."""
    req = CheckinModerationRequest(**load_fixture("fake_gps.json"))
    outcome = evaluate_checkin(req, cfg)
    lenient = RiskAssessment(
        is_risk=False, reason="정상 방문으로 보입니다.", risk_level=0, category="none", suggested_action="allow"
    )

    merged, source = merge(outcome, lenient)
    assert source == "llm+rules"
    assert merged.is_risk is True
    assert merged.risk_level == 5
    assert merged.suggested_action == "ban"


def test_llm_can_flag_what_rules_missed(cfg):
    """규칙이 조용해도 LLM의 정성적 판정은 존중한다."""
    req = CheckinModerationRequest(**load_fixture("normal_checkin.json"))
    outcome = evaluate_checkin(req, cfg)
    assert outcome.is_risk is False

    strict = RiskAssessment(
        is_risk=True,
        reason="동일 패턴의 반복 인증 정황이 있습니다.",
        risk_level=3,
        category="bot_farming",
        suggested_action="review",
    )
    merged, source = merge(outcome, strict)
    assert merged.is_risk is True
    assert merged.category == "bot_farming"
    assert source == "llm+rules"


def test_assess_checkin_with_fake_llm(cfg):
    req = CheckinModerationRequest(**load_fixture("fake_gps.json"))
    judge = FakeJudge(
        RiskAssessment(
            is_risk=True,
            reason="스팟에서 2km 이상 떨어진 좌표로 인증을 시도했습니다.",
            risk_level=5,
            category="fake_gps",
            confidence=0.95,
            suggested_action="ban",
        )
    )
    result = assess_checkin(req, cfg, judge)  # type: ignore[arg-type]

    assert isinstance(result, AssessmentResponse)
    assert result.subject_type == "checkin"
    assert result.subject_id == req.location_id
    assert result.signals  # 규칙 근거가 응답에 실려 나간다
    assert judge.calls, "LLM 판정이 호출되어야 한다"


def test_assess_content_fills_tags_from_fallback(cfg):
    req = ContentModerationRequest(uid="u_1", video_id="v_1", caption="이불 꾹꾹이 3단 콤보", duration_sec=14)
    judge = FakeJudge(
        RiskAssessment(is_risk=False, reason="정상 콘텐츠", risk_level=0, category="none", tags=[])
    )
    result = assess_content(req, cfg, judge)  # type: ignore[arg-type]

    assert result.is_risk is False
    assert "꾹꾹이" in result.tags  # LLM이 태그를 비워도 키워드 폴백이 채운다


def test_assess_content_prefers_llm_tags(cfg):
    req = ContentModerationRequest(uid="u_1", video_id="v_1", caption="박스 좋아하는 우리 고양이", duration_sec=11)
    judge = FakeJudge(
        RiskAssessment(is_risk=False, reason="정상", risk_level=0, category="none", tags=["박스", "그루밍"])
    )
    result = assess_content(req, cfg, judge)  # type: ignore[arg-type]
    assert result.tags == ["박스", "그루밍"]


# ─────────────────────────── Slack ───────────────────────────


def test_slack_payload_contains_reason_and_signals(cfg):
    req = CheckinModerationRequest(**load_fixture("fake_gps.json"))
    outcome = evaluate_checkin(req, cfg)
    merged, source = merge(outcome, None)
    result = AssessmentResponse(
        **merged.model_dump(), signals=outcome.signals, source=source, subject_type="checkin", subject_id=req.location_id
    )

    payload = build_payload(result, {"uid": req.uid, "location_name": req.location_name}, cfg)
    body = json.dumps(payload, ensure_ascii=False)

    assert "어뷰징 의심 감지" in payload["text"]
    assert req.uid in body
    assert "허용 반경 초과" in body
    assert "happicat_reverse_reward" in body  # 백오피스 대응 버튼


# ─────────────────────────── API 엔드포인트 ───────────────────────────


@pytest.fixture
def client(monkeypatch) -> TestClient:
    """LLM 은 비활성(키 없음), Slack 은 호출 기록만 남긴다."""
    sent: list[AssessmentResponse] = []
    monkeypatch.setattr(main_module, "notify", lambda result, context, cfg: sent.append(result))
    c = TestClient(main_module.app)
    c.sent = sent  # type: ignore[attr-defined]
    return c


def test_health(client):
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json()["status"] == "ok"


def test_fake_gps_checkin_triggers_slack(client):
    with client:
        res = client.post("/v1/moderate/checkin", json=load_fixture("fake_gps.json"))

    assert res.status_code == 200
    body = res.json()
    assert body["is_risk"] is True
    assert body["risk_level"] == 5
    assert body["category"] == "fake_gps"
    assert any("허용 반경 초과" in s for s in body["signals"])
    assert len(client.sent) == 1, "is_risk=True 이면 Slack 알림이 호출되어야 한다"  # type: ignore[attr-defined]


def test_normal_checkin_does_not_alert(client):
    with client:
        res = client.post("/v1/moderate/checkin", json=load_fixture("normal_checkin.json"))

    assert res.status_code == 200
    assert res.json()["is_risk"] is False
    assert client.sent == []  # type: ignore[attr-defined]


def test_spam_content_triggers_slack(client):
    with client:
        res = client.post(
            "/v1/moderate/content",
            json={
                "uid": "u_spam",
                "video_id": "v_spam",
                "caption": "바카라 첫충 이벤트 텔레그램 문의 주세요 https://spam.example",
                "duration_sec": 8,
                "uploads_last_hour": 14,
            },
        )

    assert res.status_code == 200
    body = res.json()
    assert body["is_risk"] is True
    assert body["category"] == "spam"
    assert len(client.sent) == 1  # type: ignore[attr-defined]


def test_invalid_payload_is_rejected(client):
    res = client.post("/v1/moderate/checkin", json={"uid": "u_1"})
    assert res.status_code == 422


def test_out_of_range_latitude_is_rejected(client):
    payload = load_fixture("normal_checkin.json")
    payload["reported_geo"]["lat"] = 123.4
    res = client.post("/v1/moderate/checkin", json=payload)
    assert res.status_code == 422


def test_geo_point_validation():
    with pytest.raises(ValueError):
        GeoPoint(lat=95, lng=0)
