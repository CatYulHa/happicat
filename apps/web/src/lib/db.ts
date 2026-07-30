import type { CatLocation, Giftcard, Transaction, TxInput, TxResult, User, Video } from '../types'
import { MOCK_USER } from '../mock/users'
import { MOCK_VIDEOS } from '../mock/videos'
import { MOCK_LOCATIONS } from '../mock/locations'
import { MOCK_TRANSACTIONS } from '../mock/transactions'

/**
 * 데이터 접근 어댑터.
 * MVP는 Mock 구현만 사용하고, Firestore/Supabase 는 같은 인터페이스로 갈아끼운다.
 * 중요: 잔액은 항상 원장(transactions) 합계에서 계산된다 — 화면이 잔액을 직접 쓰지 않는다.
 */
export interface DbAdapter {
  getUser(): Promise<User>
  listFeedVideos(): Promise<Video[]>
  listLocations(): Promise<CatLocation[]>
  listTransactions(limit?: number): Promise<Transaction[]>
  /** 원장 기록 + 잔액 갱신 (idempotencyKey 로 중복 차단) */
  commitTransaction(input: TxInput): Promise<TxResult>
  getBalance(): Promise<number>
  toggleLike(videoId: string): Promise<boolean>
  listLikedVideoIds(): Promise<string[]>
  listGiftcards(): Promise<Giftcard[]>
  saveGiftcard(card: Giftcard): Promise<void>
  reset(): Promise<void>
}

/* ───────────────────────── Mock 어댑터 ───────────────────────── */

const STORAGE_KEY = 'happicat.mock.v1'

interface Persisted {
  version: 1
  txs: Transaction[]
  likes: string[]
  giftcards: Giftcard[]
}

function seed(): Persisted {
  return { version: 1, txs: [...MOCK_TRANSACTIONS], likes: [], giftcards: [] }
}

function load(): Persisted {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return seed()
    const parsed = JSON.parse(raw) as Persisted
    if (parsed.version !== 1 || !Array.isArray(parsed.txs)) return seed()
    return parsed
  } catch {
    return seed()
  }
}

function save(state: Persisted) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    /* 시크릿 모드 등에서 저장 실패 — 메모리 상태로만 동작 */
  }
}

function sumBalance(txs: Transaction[]): number {
  return txs.reduce((acc, t) => (t.status === 'reversed' ? acc : acc + t.amount), 0)
}

function newId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8)
  return `${prefix}_${Date.now().toString(36)}${rand}`
}

/** 네트워크 왕복을 흉내내 UI 로딩 상태를 실제와 비슷하게 만든다 */
const tick = <T,>(value: T, ms = 120): Promise<T> => new Promise((r) => setTimeout(() => r(value), ms))

export function createMockAdapter(): DbAdapter {
  let state = load()

  return {
    async getUser() {
      const balance = sumBalance(state.txs)
      const earned = state.txs.filter((t) => t.amount > 0).reduce((a, t) => a + t.amount, 0)
      const spent = state.txs.filter((t) => t.amount < 0).reduce((a, t) => a - t.amount, 0)
      return tick<User>({ ...MOCK_USER, meowBalance: balance, lifetimeEarned: earned, lifetimeSpent: spent })
    },

    async listFeedVideos() {
      // 실서비스 쿼리: where moderation.status == 'approved' && isActive == true
      const feed = MOCK_VIDEOS.filter((v) => v.isActive && v.moderation.status === 'approved')
      return tick(feed, 200)
    },

    async listLocations() {
      return tick(MOCK_LOCATIONS.filter((l) => l.isActive), 200)
    },

    async listTransactions(limit = 50) {
      const sorted = [...state.txs].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      return tick(sorted.slice(0, limit))
    },

    async getBalance() {
      return tick(sumBalance(state.txs))
    },

    async commitTransaction(input) {
      const balance = sumBalance(state.txs)

      // 1) 멱등성: 같은 키가 이미 있으면 무시 (중복 지급 차단)
      if (state.txs.some((t) => t.idempotencyKey === input.idempotencyKey)) {
        return tick<TxResult>({ ok: false, duplicate: true, insufficient: false, balance })
      }

      // 2) 잔액 검사 (차감 트랜잭션만)
      if (input.amount < 0 && balance + input.amount < 0) {
        return tick<TxResult>({ ok: false, duplicate: false, insufficient: true, balance })
      }

      const tx: Transaction = {
        ...input,
        txId: newId('tx'),
        uid: MOCK_USER.uid,
        status: input.status ?? 'confirmed',
        balanceAfter: balance + input.amount,
        createdAt: new Date().toISOString(),
      }

      state = { ...state, txs: [...state.txs, tx] }
      save(state)
      return tick<TxResult>({ ok: true, duplicate: false, insufficient: false, balance: tx.balanceAfter, tx })
    },

    async toggleLike(videoId) {
      const liked = state.likes.includes(videoId)
      state = { ...state, likes: liked ? state.likes.filter((id) => id !== videoId) : [...state.likes, videoId] }
      save(state)
      return tick(!liked, 0)
    },

    async listLikedVideoIds() {
      return tick([...state.likes], 0)
    },

    async listGiftcards() {
      return tick([...state.giftcards].reverse(), 0)
    },

    async saveGiftcard(card) {
      state = { ...state, giftcards: [...state.giftcards, card] }
      save(state)
    },

    async reset() {
      state = seed()
      save(state)
    },
  }
}

/* ───────────────────────── 어댑터 선택 ───────────────────────── */

export function createDb(): DbAdapter {
  const kind = import.meta.env.VITE_DB_ADAPTER ?? 'mock'

  if (kind !== 'mock') {
    // TODO(step-next): createFirestoreAdapter() / createSupabaseAdapter() 구현.
    //   - commitTransaction 은 반드시 서버 트랜잭션(또는 RPC)에서
    //     transactions insert + users.meowBalance increment 를 원자적으로 수행할 것.
    //   - idempotencyKey 에 UNIQUE 제약을 걸어 중복 지급을 DB 레벨에서 차단할 것.
    console.warn(`[happicat] VITE_DB_ADAPTER="${kind}" 는 아직 미구현입니다. mock 어댑터로 실행합니다.`)
  }
  return createMockAdapter()
}

export const db = createDb()
