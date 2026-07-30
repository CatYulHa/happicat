# HappiCat Moderation Service (Step 3)

숏폼 콘텐츠와 O2O GPS 인증의 **어뷰징 판정 + Slack 백오피스 알림** 파이프라인.

```
요청 ──▶ rules.py            결정론적 규칙 (반경/속도/정확도/다계정/빈도)
         │  signals[]
         ▼
       llm.py                LLM 구조화 판정 (Pydantic 검증, 1회 재시도)
         │
         ▼
       pipeline.py           병합 — hard_fail 은 LLM이 뒤집지 못한다
         │
         ├──▶ slack.py       is_risk=True → Block Kit 알림 (BackgroundTasks)
         └──▶ AssessmentResponse  (그대로 transactions.meta 에 적재 가능)
```

## 실행

```bash
cd services/moderation
python -m venv .venv
.venv/Scripts/python -m pip install -r requirements.txt   # macOS/Linux: .venv/bin/python
.venv/Scripts/python -m uvicorn app.main:app --reload --port 8080
```

`.env` 없이도 실행된다. 이때 `llm_provider=none` 으로 **규칙 판정만** 수행하고,
Slack Webhook 이 없으면 알림 내용을 콘솔에 출력한다.

```bash
curl -s localhost:8080/health
# {"status":"ok","llm_provider":"none","model":null,"slack":"console"}
```

## 엔드포인트

| Method | Path | 설명 |
| --- | --- | --- |
| GET | `/health` | LLM/Slack 연동 상태 |
| POST | `/v1/moderate/checkin` | GPS 인증 로그 판정 (가짜 GPS·봇 파밍) |
| POST | `/v1/moderate/content` | 업로드 메타데이터 판정 + 태그 자동 분류 |

```bash
# 가짜 GPS 샘플 → is_risk: true, risk_level: 5, category: fake_gps
curl -s -X POST localhost:8080/v1/moderate/checkin \
  -H 'Content-Type: application/json' \
  -d @tests/fixtures/fake_gps.json | python -m json.tool

# 정상 인증 → is_risk: false
curl -s -X POST localhost:8080/v1/moderate/checkin \
  -H 'Content-Type: application/json' \
  -d @tests/fixtures/normal_checkin.json
```

## LLM 켜기

`.env.example` → `.env` 로 복사한 뒤 키를 넣으면 자동으로 LLM 판정이 붙는다.

```env
# NVIDIA Build API (무료, OpenAI 호환) — https://build.nvidia.com 에서 nvapi- 키 발급
NVIDIA_API_KEY=nvapi-xxxxxxxx
MODERATION_MODEL=z-ai/glm-5.2
```

- NVIDIA 는 `base_url=https://integrate.api.nvidia.com/v1` 만 바꿔 OpenAI SDK 를 그대로 쓴다 (`app/config.py`).
- `OPENAI_API_KEY` 를 넣으면 OpenAI 로 자동 전환된다.
- 무료 등급은 분당 약 40 RPM 제한이 있으니, 실서비스에서는 큐(Pub/Sub·Cloud Tasks)를 앞에 두는 것을 권장.

### 구조화 출력 방식

NVIDIA 가 호스팅하는 오픈모델은 OpenAI 의 `json_schema` 강제 모드를 지원하지 않는 경우가 있어,
`response_format={"type":"json_object"}` + **프롬프트에 `RiskAssessment.model_json_schema()` 주입** +
`RiskAssessment.model_validate_json()` 검증 조합을 쓴다. 검증 실패 시 오류 메시지를 되먹여 1회 재시도하고,
그래도 실패하면 규칙 판정으로 폴백한다 — **LLM 장애가 서비스 장애가 되지 않는다.**

## 판정 규칙 (`app/rules.py`)

| 신호 | 위험도 | 확정거절 |
| --- | --- | --- |
| 허용 반경 초과 (`radius_m` + 오차 30m) | 5 | ✅ |
| 클라이언트 신고 거리 ↔ 서버 재계산 불일치 (>50m) | 4 | ✅ |
| 직전 체크인 대비 이동속도 > 300km/h (텔레포트) | 5 | ✅ |
| GPS 정확도 0m (모의 위치 앱 특징) | 3 | |
| 동일 기기 3개 이상 계정 | 4 | |
| 최근 1시간 체크인 5회 이상 | 3 | |
| GPS 측위 30ms 미만 (자동화) | 2 | |
| 중복 업로드 / 도박·투자 스팸 / 학대 표현 | 3~4 | 중복은 ✅ |

**확정거절(hard_fail)** 은 사실의 문제이므로 LLM이 무해하다고 판정해도 뒤집히지 않는다.
반대로 규칙이 조용해도 LLM이 위험하다고 보면 그 판정을 채택한다.

## Slack 알림

`SLACK_WEBHOOK_URL` 설정 시 `is_risk && risk_level >= SLACK_MIN_RISK_LEVEL` 인 판정을 Block Kit 으로 전송한다.
헤더(위험도 이모지) · 판정 근거 · 유저/스팟/거리/정확도/지급예정액 · 규칙 신호 목록 · [보상 회수]/[정상 처리] 버튼.
전송 실패는 로깅만 하고 요청을 막지 않는다.

> Windows 콘솔에서 폴백 출력의 한글이 깨져 보이는 것은 콘솔 코드페이지(cp949) 문제이며,
> Slack 으로 전송되는 JSON 은 UTF-8 로 정상이다. `chcp 65001` 로 바꾸면 그대로 읽힌다.

## 테스트

```bash
.venv/Scripts/python -m pytest        # 32 passed — 네트워크/LLM 키 없이 통과
```

- `test_rules.py` — haversine 거리, 텔레포트 속도, 반경/정확도/쿨다운/다계정/빈도, 스팸 캡션
- `test_pipeline.py` — 병합 규칙(LLM이 hard_fail 을 못 뒤집는지), 태그 폴백, Slack 페이로드,
  API 엔드포인트(가짜 GPS → 알림 1회 호출 / 정상 → 미호출), 유효성 검사 422

## 다음 단계

- 판정 결과를 실제 원장에 반영: `is_risk` 면 `transactions.status = "pending"`(보상 홀드),
  확정이면 반대 부호 `adjustment` 로 회수 + `users.riskScore` 갱신
- Slack 버튼 → Interactive Endpoint 로 백오피스 조치 자동화
- Cloud Run / Cloud Functions 배포 + Firestore `onCreate` 트리거 연동
