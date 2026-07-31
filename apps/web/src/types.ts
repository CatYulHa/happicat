/**
 * docs/schema/*.json 의 TypeScript 미러.
 * 스키마를 바꾸면 이 파일도 함께 수정한다.
 */

export type ISODate = string

/* ─────────────── users ─────────────── */

export type UserStatus = 'active' | 'limited' | 'banned'

export interface GeoPoint {
  lat: number
  lng: number
}

export interface User {
  uid: string
  nickname: string
  photoURL?: string
  /** 커스터디 지갑 주소 (0x...). MVP에서는 가입 시 자동 생성 */
  walletAddress: string
  walletType: 'custodial' | 'external'
  meowBalance: number
  lifetimeEarned: number
  lifetimeSpent: number
  /** 다계정 어뷰징 탐지용 디바이스 지문 */
  deviceIds: string[]
  riskScore: number
  status: UserStatus
  lastCheckinAt?: ISODate
  lastCheckinGeo?: GeoPoint
  createdAt: ISODate
  updatedAt: ISODate
}

/* ─────────────── videos ─────────────── */

/** LLM이 자동 분류하는 고양이 콘텐츠 태그 */
export type CatTag = '꾹꾹이' | '먹방' | '식빵' | '우다다' | '그루밍' | '골골송' | '냥냥펀치' | '박스'

export type ModerationStatus = 'pending' | 'approved' | 'rejected' | 'review'

export interface Video {
  videoId: string
  videoURL: string
  posterURL?: string
  uploaderUid: string
  uploaderNickname: string
  caption: string
  durationSec: number
  likeCount: number
  viewCount: number
  tipTotal: number
  /** LLM 분류 결과 */
  tags: CatTag[]
  llm?: { model: string; confidence: number; classifiedAt: ISODate }
  moderation: {
    status: ModerationStatus
    riskLevel: number
    category: string
    reason?: string
    reviewedBy: 'llm' | 'human'
    reviewedAt?: ISODate
  }
  watchRewardMeow: number
  isActive: boolean
  createdAt: ISODate
}

/* ─────────────── locations ─────────────── */

export type LocationCategory = 'cafe' | 'popup' | 'shelter' | 'store' | 'event'

/** DOM 전역 `Location` 과 충돌을 피하려고 CatLocation 으로 명명 (컬렉션명은 `locations`) */
export interface CatLocation {
  locationId: string
  name: string
  category: LocationCategory
  partnerName?: string
  address: string
  geo: GeoPoint
  geohash: string
  /** 체크인 허용 반경(m) */
  radiusM: number
  /** 체크인 성공 시 지급 $MEOW */
  rewardMeow: number
  cooldownHours: number
  dailyCap: number
  todayCheckinCount: number
  requiresPhoto: boolean
  activeFrom?: ISODate
  activeUntil?: ISODate
  isActive: boolean
  thumbURL?: string
  description?: string
  createdAt: ISODate
}

/* ─────────────── transactions ─────────────── */

export type TxType =
  | 'watch_reward'
  | 'checkin_reward'
  | 'tip_sent'
  | 'tip_received'
  | 'redeem'
  | 'referral'
  | 'adjustment'

export type TxStatus = 'pending' | 'confirmed' | 'reversed'

export interface TxMeta {
  deviceId?: string
  gps?: { lat: number; lng: number; accuracyM: number }
  distanceM?: number
  watchedSec?: number
  riskLevel?: number
  moderationCategory?: string
  giftcardCode?: string
}

export interface Transaction {
  txId: string
  uid: string
  type: TxType
  /** 부호 있는 정수. 획득 +, 사용 - */
  amount: number
  balanceAfter: number
  refType?: 'video' | 'location' | 'reward' | 'user' | 'system'
  refId?: string
  refLabel?: string
  /** 중복 지급 차단 키 (유니크) */
  idempotencyKey: string
  status: TxStatus
  meta?: TxMeta
  createdAt: ISODate
}

/** transactions 생성 입력 (txId/balanceAfter/createdAt 은 원장이 채운다) */
export interface TxInput {
  type: TxType
  amount: number
  refType?: Transaction['refType']
  refId?: string
  refLabel?: string
  idempotencyKey: string
  status?: TxStatus
  meta?: TxMeta
}

export interface TxResult {
  ok: boolean
  /** idempotencyKey 중복으로 지급이 무시됨 */
  duplicate: boolean
  /** 잔액 부족으로 차감 실패 */
  insufficient: boolean
  balance: number
  tx?: Transaction
}

/* ─────────────── 랭킹 & 카드 컬렉션 ─────────────── */

/** 리더보드 한 줄. 실서비스에서는 transactions 집계 뷰(또는 주간 스냅샷 컬렉션)에서 만든다 */
export interface RankEntry {
  uid: string
  nickname: string
  /** 누적 획득 $MEOW — 랭킹 정렬 기준 */
  lifetimeEarned: number
  /** 보유 고양이 카드 수 */
  cardCount: number
  /** 연속 출석일 */
  streakDays: number
  isMe?: boolean
}

/** 카드 희귀도 — 한 번에 받은 $MEOW 양으로 결정된다 */
export type CardRarity = 'normal' | 'rare' | 'epic' | 'legend'

/**
 * 획득 트랜잭션 1건 = 고양이 카드 1장.
 * 별도 컬렉션을 두지 않고 원장에서 파생시킨다 — 카드가 곧 "이 보상을 실제로 받았다"는 증거다.
 */
export interface CatCardData {
  cardId: string
  /** 카드 외형을 결정하는 시드 (txId 기반 — 같은 보상은 항상 같은 고양이) */
  seed: string
  amount: number
  rarity: CardRarity
  title: string
  source: string
  earnedAt: ISODate
  txType: TxType
  idempotencyKey: string
}

/* ─────────────── rewards (MVP 목업 전용) ─────────────── */

/** 리워드 샵 상품. 실서비스에서는 `rewards` 컬렉션 + 기프티콘 발행 API 연동 */
export interface RewardItem {
  rewardId: string
  brand: string
  title: string
  priceMeow: number
  emoji: string
  /** 남은 수량 (0이면 품절) */
  stock: number
  hot?: boolean
}

/** 교환 완료된 기프티콘 (목업) */
export interface Giftcard {
  code: string
  rewardId: string
  title: string
  brand: string
  emoji: string
  issuedAt: ISODate
  expiresAt: ISODate
}
