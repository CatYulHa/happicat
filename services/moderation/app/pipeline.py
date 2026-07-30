"""규칙 → LLM → 병합 파이프라인. (네트워크 없이 테스트 가능하도록 분리)"""

from __future__ import annotations

from .config import Settings
from .llm import LlmJudge
from .rules import RuleOutcome, evaluate_checkin, evaluate_content, fallback_tags
from .schemas import (
    AssessmentResponse,
    CheckinModerationRequest,
    ContentModerationRequest,
    RiskAssessment,
)

ACTION_BY_LEVEL = {0: "allow", 1: "allow", 2: "review", 3: "review", 4: "hold_reward", 5: "ban"}


def merge(outcome: RuleOutcome, verdict: RiskAssessment | None) -> tuple[RiskAssessment, str]:
    """
    규칙과 LLM 판정을 합친다.

    원칙: 규칙의 hard_fail 은 LLM이 뒤집을 수 없다(반경 초과·텔레포트는 사실의 문제).
    반대로 규칙이 조용해도 LLM이 위험하다고 보면 그 판정을 존중한다(정성적 위험).
    """
    if verdict is None:
        rule_only = RiskAssessment(
            is_risk=outcome.is_risk,
            reason=outcome.reason(),
            risk_level=outcome.risk_level,
            category=outcome.category,
            confidence=0.6 if outcome.signals else 0.4,
            suggested_action=ACTION_BY_LEVEL[outcome.risk_level],  # type: ignore[arg-type]
        )
        return rule_only, "rules"

    level = max(verdict.risk_level, outcome.risk_level) if outcome.hard_fail else verdict.risk_level
    merged = verdict.model_copy(
        update={
            "is_risk": verdict.is_risk or outcome.hard_fail,
            "risk_level": level,
            "category": outcome.category if outcome.hard_fail and outcome.category != "none" else verdict.category,
            "suggested_action": (
                verdict.suggested_action
                if not outcome.hard_fail
                else _stricter(verdict.suggested_action, ACTION_BY_LEVEL[level])
            ),
        }
    )
    return merged, "llm+rules"


_ACTION_RANK = {"allow": 0, "review": 1, "hold_reward": 2, "ban": 3}


def _stricter(a: str, b: str) -> str:
    return a if _ACTION_RANK.get(a, 0) >= _ACTION_RANK.get(b, 0) else b


def assess_checkin(req: CheckinModerationRequest, cfg: Settings, judge: LlmJudge) -> AssessmentResponse:
    outcome = evaluate_checkin(req, cfg)
    verdict = judge.assess("O2O GPS 체크인 인증", req.model_dump(mode="json"), outcome)
    merged, source = merge(outcome, verdict)

    return AssessmentResponse(
        **merged.model_dump(),
        signals=outcome.signals,
        source=source,  # type: ignore[arg-type]
        subject_type="checkin",
        subject_id=req.location_id,
    )


def assess_content(req: ContentModerationRequest, cfg: Settings, judge: LlmJudge) -> AssessmentResponse:
    outcome = evaluate_content(req, cfg)
    verdict = judge.assess("유저 업로드 숏폼 콘텐츠", req.model_dump(mode="json"), outcome)
    merged, source = merge(outcome, verdict)

    # 태그 분류: LLM이 준 값을 우선하고, 없으면 키워드 폴백으로 채운다(videos.tags 를 채우는 경로)
    tags = merged.tags or fallback_tags(req.caption)

    return AssessmentResponse(
        **{**merged.model_dump(), "tags": tags},
        signals=outcome.signals,
        source=source,  # type: ignore[arg-type]
        subject_type="content",
        subject_id=req.video_id,
    )
