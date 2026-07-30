# HappiCat — 데이터베이스 스키마 (Step 1)

NoSQL(Firestore 기준) 문서형 스키마. Supabase를 쓸 경우 각 컬렉션을 테이블로, `map` 타입 필드를 `jsonb` 컬럼으로 매핑하면 그대로 이식된다.

| 파일 | 컬렉션 | 역할 |
| --- | --- | --- |
| `users.json` | `users` | 유저 프로필, 지갑 주소, 현재 보유 토큰 |
| `videos.json` | `videos` | 숏폼 영상, 좋아요 수, **LLM 자동 분류 태그**, 심사 상태 |
| `locations.json` | `locations` | O2O 스팟(좌표·반경·보상량·쿨다운) |
| `transactions.json` | `transactions` | 토큰 획득/소비 원장 (append-only) |

## 관계

```
users(uid) ─┬─< transactions(uid)            # 1:N — 지갑 내역
            ├─< videos(uploaderUid)          # 1:N — 업로드
            └─ deviceIds[]                   # 다계정 탐지 축

locations(locationId) ─< transactions(refId where refType='location')
videos(videoId)       ─< transactions(refId where refType='video')
```

## 3가지 설계 원칙

**1. 잔액은 파생값이다.**
`users.meowBalance` 는 절대 클라이언트가 쓰지 않는다. 지급/차감은 항상 서버 트랜잭션 안에서 `transactions` 문서 생성 + `meowBalance` increment 를 원자적으로 수행한다. `balanceAfter` 스냅샷이 있으므로 원장 재생(replay)만으로 정합성 검증이 가능하다.

**2. 모든 지급은 멱등하다.**
`transactions.idempotencyKey` 가 유니크 제약이다. 네트워크 재시도·중복 탭·리플레이 공격이 모두 여기서 막힌다.

| 지급 종류 | 키 형식 | 효과 |
| --- | --- | --- |
| 체크인 | `checkin:{uid}:{locationId}:{YYYYMMDD}` | 하루 1회 |
| 시청 | `watch:{uid}:{videoId}` | 영상당 1회 |
| 교환 | `redeem:{uid}:{clientTxUuid}` | 더블 클릭 방지 |
| 후원 | `tip:{uid}:{videoId}:{clientTxUuid}` | 중복 전송 방지 |

**3. 어뷰징 판정 근거를 원장에 남긴다.**
`transactions.meta` 에 GPS 정확도·스팟 거리·디바이스·시청 시간·`riskLevel` 을 적재한다. `services/moderation` 이 이 값으로 판정하고, `is_risk=true` 면 `status: "pending"`(보상 홀드) 또는 반대 부호의 `adjustment`(회수)로 처리한다. Slack 알림 본문도 이 필드들을 그대로 쓴다.

## 필수 복합 인덱스

```
transactions : uid ASC,  createdAt DESC          # 지갑 내역
transactions : idempotencyKey (UNIQUE)           # 중복 지급 차단
transactions : status ASC, meta.riskLevel DESC, createdAt DESC
videos       : moderation.status ASC, createdAt DESC   # 피드(approved만)
videos       : tags ARRAY_CONTAINS, likeCount DESC
locations    : isActive ASC, geohash ASC          # 지도 뷰포트 조회
users        : status ASC, riskScore DESC         # 백오피스 위험 유저
```

## 클라이언트 권한 요약

| 컬렉션 | read | write |
| --- | --- | --- |
| `users` | 본인 문서 전체 / 타인은 공개 필드만 | `nickname`, `photoURL` 만 |
| `videos` | `moderation.status == 'approved' && isActive` | 없음 (카운터는 서버 increment) |
| `locations` | `isActive == true` | 없음 |
| `transactions` | 본인(`uid == auth.uid`) | 없음 (전부 서버) |

## TS 타입 미러

`apps/web/src/types.ts` 가 이 스키마의 TypeScript 미러다. **스키마를 바꾸면 두 곳을 함께 수정한다.**
