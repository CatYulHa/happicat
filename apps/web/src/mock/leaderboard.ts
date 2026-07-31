import type { RankEntry } from '../types'

/**
 * 리더보드 목업.
 * 실서비스에서는 `transactions` 를 uid 별로 집계한 주간 스냅샷을 읽는다
 * (매 요청마다 원장을 스캔하면 비용이 폭발한다).
 * 현재 유저는 실제 원장 값으로 계산해 이 목록에 끼워 넣는다 — RankTab 참고.
 */
export const MOCK_LEADERBOARD: RankEntry[] = [
  { uid: 'u_5f77ac', nickname: '까망이대장', lifetimeEarned: 18420, cardCount: 132, streakDays: 47 },
  { uid: 'u_77c0de', nickname: '삼색이누나', lifetimeEarned: 15980, cardCount: 118, streakDays: 31 },
  { uid: 'u_9a02ef', nickname: '보호소지킴이', lifetimeEarned: 12250, cardCount: 96, streakDays: 63 },
  { uid: 'u_4b21aa', nickname: '치즈냥아빠', lifetimeEarned: 9840, cardCount: 74, streakDays: 12 },
  { uid: 'u_1c3d90', nickname: '성수동캣카페', lifetimeEarned: 7310, cardCount: 61, streakDays: 8 },
  { uid: 'u_2a91bb', nickname: '고등어집사', lifetimeEarned: 6120, cardCount: 55, streakDays: 21 },
  { uid: 'u_8d44c1', nickname: '냥발자국', lifetimeEarned: 4890, cardCount: 42, streakDays: 5 },
  { uid: 'u_3e77fa', nickname: '팝업덕후', lifetimeEarned: 3980, cardCount: 35, streakDays: 3 },
  { uid: 'u_6b12dd', nickname: '꾹꾹이수집가', lifetimeEarned: 2640, cardCount: 27, streakDays: 14 },
  { uid: 'u_0f93ab', nickname: '길냥이친구', lifetimeEarned: 1870, cardCount: 19, streakDays: 2 },
  { uid: 'u_7c55ee', nickname: '츄르배달부', lifetimeEarned: 1240, cardCount: 13, streakDays: 6 },
  { uid: 'u_9911bc', nickname: '식빵굽는냥', lifetimeEarned: 860, cardCount: 9, streakDays: 1 },
]
