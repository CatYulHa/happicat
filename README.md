# happi cat 🐾 — MVP 목업

> 보면 벌고, 가면 벌린다.
> 고양이 숏폼 시청(Cat TikTok)과 오프라인 방문(O2O)으로 **$MEOW** 를 모아 기프티콘으로 교환하는 Web3 라이프스타일 리워드 앱.

이 저장소는 전체 생태계 중 **핵심 3플로우**만 구현한 검증용 목업이다.

| # | 기능 | 구현 위치 |
| --- | --- | --- |
| 1 | 숏폼 피드 (스와이프 + 시청 보상 + 토큰 후원) | `apps/web/src/tabs/FeedTab.tsx` |
| 2 | O2O 지도 & GPS 스팟 인증 | `apps/web/src/tabs/MapTab.tsx` |
| 3 | 토큰 지갑 & 리워드 교환 | `apps/web/src/tabs/WalletTab.tsx` |
| + | LLM 어뷰징 필터 + Slack 모니터링 | `services/moderation/` |

## 빠른 실행

**외부 API 키가 하나도 없어도 전부 동작한다.** (Mock 어댑터 + 폴백 지도 + 규칙 기반 판정)

```bash
# 1) 프론트엔드
cd apps/web
npm install
npm run dev            # http://localhost:5173

# 2) 어뷰징 판정 백엔드 (선택)
cd services/moderation
python -m venv .venv
.venv/Scripts/python -m pip install -r requirements.txt    # macOS/Linux: .venv/bin/python
.venv/Scripts/python -m uvicorn app.main:app --reload --port 8080
```

### 목업 체험 순서

1. **피드** — 위아래로 스와이프. 5초 이상 보면 우측 링 게이지가 차고 `+5 MEOW` 가 적립된다.
   하트로 좋아요, 코인 버튼으로 크리에이터에게 후원(잔액 차감).
2. **지도** — 스팟 카드/마커를 탭 → "GPS 인증하고 50 MEOW 받기".
   데스크톱에서는 주소창에 **`?mockGps=1`** 을 붙이면(`http://localhost:5173/?mockGps=1`) 스팟 근처 좌표가 주입되어 성공 플로우를 볼 수 있다.
   파라미터 없이 실제 위치로 시도하면 "OOm 더 가까이 가세요" 거절 플로우가 나온다.
3. **지갑** — 잔액/지갑주소 카드, 리워드 샵에서 **스타벅스 아메리카노(3,000 MEOW)** 교환 → 목업 기프티콘(바코드+코드) 발급, 하단에 원장 내역 누적.

잔액과 내역은 `localStorage` 에 저장되어 새로고침에도 유지된다. 지갑 탭 하단 "데모 초기화"로 리셋.

## 구조

```
happicat/
├─ docs/
│  ├─ index.html            # 기존 팀 소개 페이지 (건드리지 않음)
│  └─ schema/               # ── Step 1: NoSQL 스키마 (users/videos/locations/transactions)
├─ apps/web/                # ── Step 2: Vite + React 19 + TS + Tailwind v4
│  └─ src/
│     ├─ tabs/              # FeedTab / MapTab / WalletTab
│     ├─ components/        # PhoneFrame, TabBar, BottomSheet, 아이콘
│     ├─ lib/               # db(어댑터), geo(haversine·GPS), kakao(SDK 로더), moderation(백엔드 호출)
│     ├─ store/AppState.tsx # 잔액·원장·좋아요 상태 + 도메인 액션
│     ├─ mock/              # 목업 데이터 (유저/영상/스팟/원장/리워드)
│     └─ types.ts           # docs/schema 의 TS 미러
└─ services/moderation/     # ── Step 3: FastAPI + Pydantic + Slack
   └─ app/{rules,llm,pipeline,slack,schemas,config,main}.py
```

## 설계 원칙 3가지

**1. 잔액은 원장의 파생값이다.**
화면은 절대 잔액을 직접 쓰지 않는다. 모든 지급/차감은 `transactions` 한 건으로 기록되고 잔액은 그 합계다.
→ `apps/web/src/lib/db.ts` 의 `commitTransaction()`, `docs/schema/README.md`

**2. 모든 지급은 멱등하다.**
`idempotencyKey` 로 중복 지급을 차단한다. 체크인은 `checkin:{locationId}:{YYYYMMDD}`(하루 1회), 시청은 `watch:{videoId}`(영상당 1회).
→ 더블탭·네트워크 재시도·리플레이 공격이 같은 지점에서 막힌다.

**3. 어뷰징은 규칙이 먼저, LLM이 나중이다.**
반경 초과·텔레포트처럼 확실한 건 결정론적 규칙이 즉시 잡고(LLM이 뒤집을 수 없음), 정성적 위험은 LLM이 판정한다.
LLM 응답은 반드시 Pydantic(`RiskAssessment`)으로 검증하며, 실패 시 규칙 판정으로 폴백해 **LLM 장애가 서비스 장애가 되지 않는다.**

## AI(LLM)가 필요한 곳 / 필요 없는 곳

목업을 만들면서 **AI를 실제로 써야 하는 지점만** 남기고 나머지는 규칙 코드로 내렸다. 판단 기준은 세 가지 —
비용(호출당 과금), 지연(체크인은 2초 안에 끝나야 한다), 결정성(같은 입력에 같은 판정이 나와야 감사가 된다).

### ✅ 지금 AI가 쓰이는 곳 (구현 완료)

| 용도 | 위치 | AI 없을 때 |
| --- | --- | --- |
| 콘텐츠 태그 자동 분류 (`videos.tags` — 꾹꾹이/먹방/식빵…) | `services/moderation/app/pipeline.py: assess_content()` | `rules.fallback_tags()` 키워드 매칭으로 폴백 |
| 회색지대 어뷰징 판정 (캡션 스팸·학대 암시·저작권, 정황 종합) | `services/moderation/app/llm.py: LlmJudge.assess()` | 규칙 판정만으로 응답 |

### ❌ AI를 쓰면 안 되는 곳 (규칙으로 충분)

GPS 반경 검사·텔레포트 속도·정확도 0m·쿨다운·다계정·체크인 빈도 → 전부 `app/rules.py` 의 결정론적 검사다.
실제로 가짜 GPS 픽스처를 넣어보면 `risk_level: 5, source: "rules"` 로 **LLM 호출 없이** 잡힌다.
잔액 계산·멱등성·원장 정합성도 AI 영역이 아니다. 초기 피드 추천 역시 태그+인기순으로 충분하고,
임베딩 기반 개인화는 유저가 수천 명 모인 뒤의 문제다.

### ⚠️ AI가 더 필요한데 아직 없는 곳 (실제 갭)

1. **영상 내용 검증 — Vision 모델 필요.** 현재 심사는 캡션 텍스트만 본다. 즉 **"이게 고양이 영상인지"를 아무도 확인하지 않는다.**
   아무 영상이나 올려 시청 보상을 파밍하는 경로가 열려 있으니, 프레임 3~5장을 샘플링해 VLM으로 (고양이 유무 / NSFW / 학대) 판정하는 단계가 필요하다.
   토큰 이코노미에서 가장 큰 구멍이다.
2. **현장 사진 인증 — Vision 모델 필요.** `locations.requiresPhoto: true`(팝업스토어)인데 검증 경로가 없다.
   지도 탭에 "사진 인증 필요" 배지만 있고 `/v1/moderate/photo` 는 미구현이다.
3. **중복 업로드 탐지는 AI가 아니라 해시.** `ContentModerationRequest.duplicate_of` 를 채워줄 주체가 없다.
   pHash(perceptual hash) + ffmpeg 프레임 추출로 계산해야 하며 API 키가 필요 없다.
4. (선택) 캡션 자동 생성·다국어 번역, 고객문의 봇 — 있으면 좋지만 MVP 검증에는 불필요.

### 필요한 API 키 정리

| 용도 | 공급자 | 상태 |
| --- | --- | --- |
| 텍스트 판정·태그 분류 | [NVIDIA Build API](https://build.nvidia.com) 무료 `nvapi-` 키 (OpenAI 호환) | 연동 완료 (`MODERATION_MODEL=z-ai/glm-5.2`) |
| 이미지·영상 프레임 판정 | VLM 필요 — NVIDIA 호스팅 모델은 지원 여부 확인 필요, Gemini/OpenAI vision 이 확실 | **미연동** |
| 중복 탐지 | 없음 (`imagehash` + `ffmpeg`) | 미구현 |

무료 등급은 분당 약 40 RPM 이므로 업로드가 늘면 큐(Cloud Tasks/Pub-Sub)를 앞에 둬야 한다.

## 선택 연동

| 환경변수 | 위치 | 없을 때 동작 |
| --- | --- | --- |
| `VITE_KAKAO_MAP_KEY` | `apps/web/.env` | 좌표 기반 폴백 목업 지도로 자동 전환 |
| `VITE_MODERATION_API_URL` | `apps/web/.env` | 어뷰징 판정 호출을 건너뜀 |
| `NVIDIA_API_KEY` (또는 `OPENAI_API_KEY`) | `services/moderation/.env` | 규칙 기반 판정만 수행 |
| `SLACK_WEBHOOK_URL` | `services/moderation/.env` | 알림 내용을 콘솔에 출력 |

각 디렉터리의 `.env.example` 을 복사해서 사용한다. LLM 은 무료 [NVIDIA Build API](https://build.nvidia.com)(OpenAI 호환)를 기본값으로 둔다.

## 검증

```bash
cd apps/web && npm run build                          # tsc --noEmit + vite build
cd services/moderation && .venv/Scripts/python -m pytest   # 32 passed
```

## 범위 밖 (다음 단계)

온체인 $MEOW 컨트랙트와 정산 배치, Firestore/Supabase 실제 어댑터(인터페이스는 준비됨),
소셜 로그인, 영상 업로드 파이프라인, 실제 기프티콘 발행 API 연동.
