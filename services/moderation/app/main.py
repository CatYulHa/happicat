"""HappiCat 어뷰징 필터링 API.

흐름:
  요청 → 결정론적 규칙(rules) → LLM 구조화 판정(llm, Pydantic 검증) → 병합(pipeline)
       → is_risk 이면 Slack 백오피스 알림(background) → 판정 결과 응답

응답은 그대로 `transactions.meta` 에 붙일 수 있는 형태다(docs/schema/transactions.json 참고).
"""

from __future__ import annotations

import logging

from fastapi import BackgroundTasks, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .llm import LlmJudge
from .pipeline import assess_checkin, assess_content
from .schemas import AssessmentResponse, CheckinModerationRequest, ContentModerationRequest
from .slack import notify

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s | %(message)s")
log = logging.getLogger("happicat.api")

cfg = get_settings()
judge = LlmJudge(cfg)

app = FastAPI(
    title="HappiCat Moderation API",
    version="0.1.0",
    description="숏폼 콘텐츠·O2O GPS 인증 어뷰징 판정 + Slack 백오피스 알림",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=cfg.origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, object]:
    return {
        "status": "ok",
        "llm_provider": cfg.llm_provider,  # nvidia | openai | none(규칙 판정만)
        "model": cfg.moderation_model if judge.enabled else None,
        "slack": "webhook" if cfg.slack_webhook_url else "console",
    }


@app.post("/v1/moderate/checkin", response_model=AssessmentResponse)
def moderate_checkin(req: CheckinModerationRequest, tasks: BackgroundTasks) -> AssessmentResponse:
    result = assess_checkin(req, cfg, judge)
    log.info(
        "checkin uid=%s loc=%s risk=%s(%s) source=%s",
        req.uid,
        req.location_id,
        result.risk_level,
        result.category,
        result.source,
    )
    _maybe_alert(
        result,
        tasks,
        {
            "uid": req.uid,
            "device_id": req.device_id,
            "location_name": req.location_name or req.location_id,
            "distance_m": req.distance_m,
            "accuracy_m": req.accuracy_m,
            "reward_meow": req.reward_meow,
        },
    )
    return result


@app.post("/v1/moderate/content", response_model=AssessmentResponse)
def moderate_content(req: ContentModerationRequest, tasks: BackgroundTasks) -> AssessmentResponse:
    result = assess_content(req, cfg, judge)
    log.info(
        "content uid=%s video=%s risk=%s(%s) tags=%s source=%s",
        req.uid,
        req.video_id,
        result.risk_level,
        result.category,
        result.tags,
        result.source,
    )
    _maybe_alert(result, tasks, {"uid": req.uid, "caption": req.caption[:80]})
    return result


def _maybe_alert(result: AssessmentResponse, tasks: BackgroundTasks, context: dict[str, object]) -> None:
    """is_risk 이고 임계 위험도 이상이면 Slack 으로 즉시 알린다(요청 응답은 기다리지 않는다)."""
    if result.is_risk and result.risk_level >= cfg.slack_min_risk_level:
        tasks.add_task(notify, result, context, cfg)
