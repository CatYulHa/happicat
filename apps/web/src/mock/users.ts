import type { User } from '../types'

/** 목업 로그인 유저 (실서비스에서는 Firebase Anonymous/Kakao Auth 로 대체) */
export const MOCK_USER: User = {
  uid: 'u_9f3c21',
  nickname: '냥집사율',
  photoURL: undefined,
  walletAddress: '0x1f4ad3b95c7e2016b0a5d3f8b1c9e77425d69ac2',
  walletType: 'custodial',
  meowBalance: 3250, // 실제 값은 원장(transactions) 합계로 계산된다
  lifetimeEarned: 4755,
  lifetimeSpent: 1505,
  deviceIds: ['dev_a91f7c2e'],
  riskScore: 8,
  status: 'active',
  lastCheckinAt: '2026-07-28T11:02:00.000Z',
  lastCheckinGeo: { lat: 37.5563, lng: 126.9236 },
  createdAt: '2026-06-02T04:31:10.000Z',
  updatedAt: '2026-07-28T11:02:00.000Z',
}
