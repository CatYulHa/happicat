import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { db } from '../lib/db'
import { haversineM } from '../lib/geo'
import type { GeoFix } from '../lib/geo'
import { reportCheckin } from '../lib/moderation'
import type {
  CatLocation,
  Giftcard,
  RewardItem,
  Transaction,
  TxResult,
  User,
  Video,
} from '../types'

export type ToastKind = 'earn' | 'spend' | 'info' | 'error'

export interface Toast {
  id: string
  kind: ToastKind
  message: string
}

export interface CheckinOutcome {
  status: 'success' | 'too_far' | 'duplicate' | 'error'
  distanceM?: number
  earned?: number
  message: string
  /** 백엔드 어뷰징 판정 결과 (백엔드 미연동 시 undefined) */
  risk?: { is_risk: boolean; risk_level: number; reason: string }
}

export interface RedeemOutcome {
  status: 'success' | 'insufficient' | 'error'
  giftcard?: Giftcard
  message: string
}

interface AppStateValue {
  ready: boolean
  user: User | null
  balance: number
  videos: Video[]
  locations: CatLocation[]
  transactions: Transaction[]
  giftcards: Giftcard[]
  likedIds: Set<string>
  toasts: Toast[]

  toggleLike: (videoId: string) => Promise<boolean>
  tipVideo: (video: Video, amount: number) => Promise<TxResult>
  claimWatchReward: (video: Video) => Promise<TxResult>
  checkin: (location: CatLocation, fix: GeoFix) => Promise<CheckinOutcome>
  redeem: (reward: RewardItem) => Promise<RedeemOutcome>
  pushToast: (message: string, kind?: ToastKind) => void
  resetDemo: () => Promise<void>
}

const AppStateContext = createContext<AppStateValue | null>(null)

const todayKey = () => new Date().toISOString().slice(0, 10).replace(/-/g, '')
const uuid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2)

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [user, setUser] = useState<User | null>(null)
  const [balance, setBalance] = useState(0)
  const [videos, setVideos] = useState<Video[]>([])
  const [locations, setLocations] = useState<CatLocation[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [giftcards, setGiftcards] = useState<Giftcard[]>([])
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set())
  const [toasts, setToasts] = useState<Toast[]>([])
  const timers = useRef<number[]>([])

  /* 초기 로드 */
  useEffect(() => {
    let alive = true
    void (async () => {
      const [u, v, l, t, g, likes] = await Promise.all([
        db.getUser(),
        db.listFeedVideos(),
        db.listLocations(),
        db.listTransactions(),
        db.listGiftcards(),
        db.listLikedVideoIds(),
      ])
      if (!alive) return
      setUser(u)
      setBalance(u.meowBalance)
      setVideos(v)
      setLocations(l)
      setTransactions(t)
      setGiftcards(g)
      setLikedIds(new Set(likes))
      setReady(true)
    })()
    return () => {
      alive = false
      timers.current.forEach(clearTimeout)
    }
  }, [])

  const pushToast = useCallback((message: string, kind: ToastKind = 'info') => {
    const toast: Toast = { id: uuid(), kind, message }
    setToasts((prev) => [...prev, toast].slice(-3))
    const timer = window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== toast.id))
    }, 2600)
    timers.current.push(timer)
  }, [])

  /** 원장 커밋 후 잔액/내역을 서버(어댑터) 기준으로 다시 읽어온다 */
  const refreshLedger = useCallback(async (nextBalance: number) => {
    setBalance(nextBalance)
    setTransactions(await db.listTransactions())
    setUser((prev) => (prev ? { ...prev, meowBalance: nextBalance } : prev))
  }, [])

  const toggleLike = useCallback(async (videoId: string) => {
    const liked = await db.toggleLike(videoId)
    setLikedIds((prev) => {
      const next = new Set(prev)
      if (liked) next.add(videoId)
      else next.delete(videoId)
      return next
    })
    return liked
  }, [])

  const tipVideo = useCallback(
    async (video: Video, amount: number) => {
      const res = await db.commitTransaction({
        type: 'tip_sent',
        amount: -amount,
        refType: 'video',
        refId: video.videoId,
        refLabel: video.caption.slice(0, 24),
        idempotencyKey: `tip:${video.videoId}:${uuid()}`,
      })

      if (res.ok) {
        await refreshLedger(res.balance)
        pushToast(`@${video.uploaderNickname} 에게 ${amount} MEOW 후원 완료 🐾`, 'spend')
      } else if (res.insufficient) {
        pushToast('잔액이 부족합니다.', 'error')
      }
      return res
    },
    [pushToast, refreshLedger],
  )

  /** 시청 보상은 영상당 1회 (idempotencyKey = watch:{videoId}) */
  const claimWatchReward = useCallback(
    async (video: Video) => {
      const res = await db.commitTransaction({
        type: 'watch_reward',
        amount: video.watchRewardMeow,
        refType: 'video',
        refId: video.videoId,
        refLabel: video.caption.slice(0, 24),
        idempotencyKey: `watch:${video.videoId}`,
        meta: { watchedSec: video.durationSec },
      })

      if (res.ok) {
        await refreshLedger(res.balance)
        pushToast(`시청 보상 +${video.watchRewardMeow} MEOW`, 'earn')
      }
      return res
    },
    [pushToast, refreshLedger],
  )

  const checkin = useCallback(
    async (location: CatLocation, fix: GeoFix): Promise<CheckinOutcome> => {
      const distanceM = haversineM(fix.coords, location.geo)

      // 1) 반경 검사 (클라이언트 1차 — 서버도 동일 검사를 반복한다)
      if (distanceM > location.radiusM) {
        return {
          status: 'too_far',
          distanceM,
          message: `스팟에서 ${Math.round(distanceM - location.radiusM)}m 더 가까이 가야 인증할 수 있어요.`,
        }
      }

      // 2) 원장 기록 (하루 1회 멱등)
      const res = await db.commitTransaction({
        type: 'checkin_reward',
        amount: location.rewardMeow,
        refType: 'location',
        refId: location.locationId,
        refLabel: location.name,
        idempotencyKey: `checkin:${location.locationId}:${todayKey()}`,
        meta: {
          deviceId: user?.deviceIds[0],
          gps: { lat: fix.coords.lat, lng: fix.coords.lng, accuracyM: fix.accuracyM },
          distanceM: Math.round(distanceM * 10) / 10,
        },
      })

      if (res.duplicate) {
        return { status: 'duplicate', distanceM, message: '오늘은 이미 이 스팟에서 인증했어요. 내일 다시 만나요! 🐾' }
      }
      if (!res.ok) {
        return { status: 'error', distanceM, message: '인증 처리 중 문제가 발생했습니다.' }
      }

      await refreshLedger(res.balance)
      setUser((prev) =>
        prev ? { ...prev, lastCheckinAt: new Date().toISOString(), lastCheckinGeo: fix.coords } : prev,
      )
      pushToast(`체크인 성공 +${location.rewardMeow} MEOW`, 'earn')

      // 3) 어뷰징 판정은 비동기 — 결과를 기다리지 않고 UX를 진행시킨다
      const risk = user
        ? await reportCheckin({
            uid: user.uid,
            deviceId: user.deviceIds[0] ?? 'dev_unknown',
            location,
            fix,
            distanceM,
            lastCheckinAt: user.lastCheckinAt,
            lastCheckinGeo: user.lastCheckinGeo,
          })
        : null

      if (risk?.is_risk) {
        pushToast('이 인증은 검토 대상으로 표시되었습니다.', 'error')
      }

      return {
        status: 'success',
        distanceM,
        earned: location.rewardMeow,
        message: `${location.name} 인증 완료!`,
        risk: risk ? { is_risk: risk.is_risk, risk_level: risk.risk_level, reason: risk.reason } : undefined,
      }
    },
    [pushToast, refreshLedger, user],
  )

  const redeem = useCallback(
    async (reward: RewardItem): Promise<RedeemOutcome> => {
      const clientTxId = uuid()
      const res = await db.commitTransaction({
        type: 'redeem',
        amount: -reward.priceMeow,
        refType: 'reward',
        refId: reward.rewardId,
        refLabel: `${reward.brand} ${reward.title}`,
        idempotencyKey: `redeem:${reward.rewardId}:${clientTxId}`,
        meta: { giftcardCode: mockGiftcardCode(reward.brand) },
      })

      if (res.insufficient) {
        return {
          status: 'insufficient',
          message: `${(reward.priceMeow - balance).toLocaleString()} MEOW 가 더 필요해요.`,
        }
      }
      if (!res.ok) return { status: 'error', message: '교환에 실패했습니다. 다시 시도해 주세요.' }

      const card: Giftcard = {
        code: res.tx?.meta?.giftcardCode ?? mockGiftcardCode(reward.brand),
        rewardId: reward.rewardId,
        title: reward.title,
        brand: reward.brand,
        emoji: reward.emoji,
        issuedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 90).toISOString(),
      }
      await db.saveGiftcard(card)
      setGiftcards(await db.listGiftcards())
      await refreshLedger(res.balance)
      pushToast(`${reward.title} 교환 완료 🎁`, 'spend')

      return { status: 'success', giftcard: card, message: '기프티콘이 발급되었습니다.' }
    },
    [balance, pushToast, refreshLedger],
  )

  const resetDemo = useCallback(async () => {
    await db.reset()
    const [u, t, g, likes] = await Promise.all([
      db.getUser(),
      db.listTransactions(),
      db.listGiftcards(),
      db.listLikedVideoIds(),
    ])
    setUser(u)
    setBalance(u.meowBalance)
    setTransactions(t)
    setGiftcards(g)
    setLikedIds(new Set(likes))
    pushToast('데모 데이터를 초기화했어요.', 'info')
  }, [pushToast])

  const value = useMemo<AppStateValue>(
    () => ({
      ready,
      user,
      balance,
      videos,
      locations,
      transactions,
      giftcards,
      likedIds,
      toasts,
      toggleLike,
      tipVideo,
      claimWatchReward,
      checkin,
      redeem,
      pushToast,
      resetDemo,
    }),
    [
      ready,
      user,
      balance,
      videos,
      locations,
      transactions,
      giftcards,
      likedIds,
      toasts,
      toggleLike,
      tipVideo,
      claimWatchReward,
      checkin,
      redeem,
      pushToast,
      resetDemo,
    ],
  )

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>
}

export function useApp(): AppStateValue {
  const ctx = useContext(AppStateContext)
  if (!ctx) throw new Error('useApp must be used inside <AppStateProvider>')
  return ctx
}

function mockGiftcardCode(brand: string): string {
  const block = () => Math.floor(1000 + Math.random() * 9000).toString()
  const prefix = brand.replace(/[^A-Za-z가-힣]/g, '').slice(0, 2).toUpperCase() || 'CN'
  return `${prefix}-${block()}-${block()}-${block()}`
}
