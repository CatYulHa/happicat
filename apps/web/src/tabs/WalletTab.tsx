import { useEffect, useRef, useState } from 'react'
import { useApp } from '../store/AppState'
import type { RedeemOutcome } from '../store/AppState'
import { BottomSheet } from '../components/BottomSheet'
import { CopyIcon, MeowCoin, Squiggle } from '../components/MeowIcon'
import { MOCK_REWARDS } from '../mock/rewards'
import type { Giftcard, RewardItem, Transaction } from '../types'

const TX_LABEL: Record<Transaction['type'], string> = {
  watch_reward: '시청 보상',
  checkin_reward: '스팟 체크인',
  tip_sent: '후원 보냄',
  tip_received: '후원 받음',
  redeem: '리워드 교환',
  referral: '친구 초대',
  adjustment: '보정',
}

const TX_EMOJI: Record<Transaction['type'], string> = {
  watch_reward: '▶️',
  checkin_reward: '📍',
  tip_sent: '💝',
  tip_received: '🎁',
  redeem: '🎫',
  referral: '👥',
  adjustment: '⚙️',
}

export function WalletTab() {
  const { user, balance, transactions, giftcards, redeem, resetDemo } = useApp()
  const [target, setTarget] = useState<RewardItem | null>(null)
  const [issued, setIssued] = useState<Giftcard | null>(null)
  const shown = useCountUp(balance)

  if (!user) return null

  return (
    <div className="paper no-scrollbar h-full overflow-y-auto pb-24">
      {/* 잔액 카드 */}
      <section className="px-4 pt-[max(16px,env(safe-area-inset-top))]">
        <div className="sketch tilt-l bg-paper-2 relative overflow-hidden p-5">
          <div className="flex items-center justify-between">
            <span className="text-ink-2 font-hand text-xl leading-none">내 지갑</span>
            <span className="border-sage bg-sage/20 font-hand rounded-full border-2 px-2 text-base leading-tight">
              {user.status === 'active' ? '정상' : user.status}
            </span>
          </div>

          <div className="mt-2 flex items-end gap-2">
            <MeowCoin className="mb-1.5 h-8 w-8" />
            <span className="font-hand text-[52px] leading-none font-bold">{shown.toLocaleString()}</span>
            <span className="text-ink-2 font-hand mb-1.5 text-2xl leading-none">$MEOW</span>
          </div>
          <Squiggle className="mt-0.5 h-2 w-40" />

          <WalletAddress address={user.walletAddress} />
          <OnchainBadge />

          <div className="mt-4 grid grid-cols-2 gap-2">
            <div className="sketch-thin bg-sage/12 px-3 py-2">
              <p className="text-ink-3 text-[10px] font-bold">누적 획득</p>
              <p className="font-hand text-sage text-2xl leading-none">+{user.lifetimeEarned.toLocaleString()}</p>
            </div>
            <div className="sketch-thin bg-clay/12 px-3 py-2">
              <p className="text-ink-3 text-[10px] font-bold">누적 사용</p>
              <p className="font-hand text-clay text-2xl leading-none">-{user.lifetimeSpent.toLocaleString()}</p>
            </div>
          </div>
        </div>
      </section>

      {/* 리워드 샵 */}
      <section className="px-4 pt-6">
        <div className="mb-2.5 flex items-end justify-between">
          <h2 className="font-hand text-3xl leading-none">리워드 샵</h2>
          <span className="text-ink-3 font-hand text-lg leading-none">$MEOW로 바로 교환</span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {MOCK_REWARDS.map((reward, i) => {
            const affordable = balance >= reward.priceMeow
            const soldout = reward.stock === 0
            return (
              <div
                key={reward.rewardId}
                className={`sketch-soft bg-paper-2 relative flex flex-col p-3 ${i % 2 === 0 ? 'tilt-l' : 'tilt-r'}`}
              >
                {reward.hot && (
                  <span className="border-ink bg-clay/25 font-hand absolute top-2 right-2 rounded-full border-2 px-1.5 text-sm leading-tight">
                    인기
                  </span>
                )}
                <span className="text-3xl">{reward.emoji}</span>
                <p className="text-ink-3 mt-1.5 text-[10px] font-bold">{reward.brand}</p>
                <p className="font-hand text-xl leading-tight">{reward.title}</p>
                <p className="text-ink-3 mt-0.5 text-[10px]">남은 수량 {reward.stock.toLocaleString()}개</p>

                <button
                  type="button"
                  onClick={() => setTarget(reward)}
                  disabled={!affordable || soldout}
                  className={`sketch-press border-ink font-hand mt-2 flex w-full items-center justify-center gap-1 rounded-full border-[2.5px] py-1.5 text-lg leading-none ${
                    affordable && !soldout ? 'bg-honey shadow-[2px_2px_0_rgba(52,48,42,0.18)]' : 'bg-paper-3 text-ink-3'
                  }`}
                >
                  {soldout ? (
                    '품절'
                  ) : (
                    <>
                      <MeowCoin className="h-4 w-4" />
                      {reward.priceMeow.toLocaleString()} 교환
                    </>
                  )}
                </button>
                {!affordable && !soldout && (
                  <p className="text-ink-3 mt-1 text-center text-[10px]">
                    {(reward.priceMeow - balance).toLocaleString()} MEOW 부족
                  </p>
                )}
              </div>
            )
          })}
        </div>
      </section>

      {/* 보유 기프티콘 */}
      {giftcards.length > 0 && (
        <section className="px-4 pt-6">
          <h2 className="font-hand mb-2.5 text-3xl leading-none">내 기프티콘</h2>
          <div className="space-y-2.5">
            {giftcards.map((card) => (
              <button
                key={card.code}
                type="button"
                onClick={() => setIssued(card)}
                className="sketch-dashed sketch-press bg-honey/12 flex w-full items-center gap-3 p-3 text-left"
              >
                <span className="text-2xl">{card.emoji}</span>
                <span className="min-w-0 flex-1">
                  <span className="font-hand block truncate text-xl leading-tight">{card.title}</span>
                  <span className="text-ink-3 block font-mono text-[11px]">{card.code}</span>
                </span>
                <span className="font-hand text-honey-2 text-lg leading-none">사용하기 →</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* 거래 내역 */}
      <section className="px-4 pt-6">
        <div className="mb-2.5 flex items-end justify-between">
          <h2 className="font-hand text-3xl leading-none">토큰 내역</h2>
          <button
            type="button"
            onClick={() => void resetDemo()}
            className="text-ink-3 font-hand text-lg leading-none underline"
          >
            데모 초기화
          </button>
        </div>

        <ul className="space-y-2">
          {transactions.map((tx) => (
            <li key={tx.txId} className="sketch-thin bg-paper-2 flex items-center gap-3 px-3 py-2.5">
              <span className="border-line bg-paper-3 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 text-base">
                {TX_EMOJI[tx.type]}
              </span>
              <span className="min-w-0 flex-1">
                <span className="font-hand block truncate text-xl leading-tight">
                  {tx.refLabel ?? TX_LABEL[tx.type]}
                </span>
                <span className="text-ink-3 block text-[11px]">
                  {TX_LABEL[tx.type]} · {relativeTime(tx.createdAt)}
                  {tx.status === 'pending' && <span className="text-clay"> · 심사중</span>}
                </span>
              </span>
              <span className={`font-hand shrink-0 text-2xl leading-none ${tx.amount > 0 ? 'text-sage' : 'text-clay'}`}>
                {tx.amount > 0 ? '+' : ''}
                {tx.amount.toLocaleString()}
              </span>
            </li>
          ))}
        </ul>

        <p className="text-ink-3 mt-3 text-center text-[10px] leading-relaxed">
          모든 지급/차감은 idempotencyKey 로 중복이 차단된 원장 기록입니다.
          <br />
          잔액은 원장 합계의 파생값입니다.
        </p>
      </section>

      <RedeemSheet
        reward={target}
        balance={balance}
        onClose={() => setTarget(null)}
        onConfirm={async (reward) => {
          const res = await redeem(reward)
          if (res.status === 'success' && res.giftcard) {
            setTarget(null)
            setIssued(res.giftcard)
          }
          return res
        }}
      />
      <GiftcardSheet card={issued} onClose={() => setIssued(null)} />
    </div>
  )
}

/* ───────────────────────── 지갑 주소 ───────────────────────── */

function WalletAddress({ address }: { address: string }) {
  const [copied, setCopied] = useState(false)
  const short = `${address.slice(0, 6)}…${address.slice(-4)}`

  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(address)
          setCopied(true)
          setTimeout(() => setCopied(false), 1400)
        } catch {
          setCopied(false)
        }
      }}
      className="sketch-press border-line text-ink-2 mt-2.5 flex items-center gap-1.5 rounded-full border-2 bg-paper-3 px-2.5 py-1 font-mono text-[11px]"
    >
      {copied ? '주소가 복사되었어요' : short}
      <CopyIcon className="h-3.5 w-3.5" />
    </button>
  )
}

/* ───────────────────────── 온체인 배지 ───────────────────────── */

/**
 * GIWA Sepolia 에 배포·검증된 $MEOW 컨트랙트로 가는 링크.
 * 지갑 연결은 하지 않는다 — 목업 잔액과 온체인 잔액이 섞이지 않도록 읽기 전용 링크만 둔다.
 * VITE_MEOW_CONTRACT_ADDRESS 가 없으면 아무것도 렌더하지 않는다.
 */
function OnchainBadge() {
  const address = import.meta.env.VITE_MEOW_CONTRACT_ADDRESS
  if (!address) return null

  const explorer = (import.meta.env.VITE_GIWA_EXPLORER_URL ?? 'https://sepolia-explorer.giwa.io').replace(
    /\/$/,
    '',
  )
  const short = `${address.slice(0, 6)}…${address.slice(-4)}`

  return (
    <a
      href={`${explorer}/address/${address}`}
      target="_blank"
      rel="noreferrer"
      className="sketch-press border-line text-ink-2 mt-1.5 flex w-fit items-center gap-1.5 rounded-full border-2 bg-paper-3 px-2.5 py-1 text-[11px]"
      title="GIWA Sepolia 에 배포·검증된 $MEOW 컨트랙트"
    >
      <span className="bg-sage h-1.5 w-1.5 rounded-full" />
      <span className="font-hand text-base leading-none">GIWA Sepolia</span>
      <span className="font-mono">{short}</span>
      <span className="text-ink-3">↗</span>
    </a>
  )
}

/* ───────────────────────── 교환 확인 시트 ───────────────────────── */

function RedeemSheet({
  reward,
  balance,
  onClose,
  onConfirm,
}: {
  reward: RewardItem | null
  balance: number
  onClose: () => void
  onConfirm: (reward: RewardItem) => Promise<RedeemOutcome>
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setError(null)
    setBusy(false)
  }, [reward])

  if (!reward) return null

  return (
    <BottomSheet open onClose={onClose} title="리워드 교환">
      <div className="sketch-soft bg-paper-2 flex items-center gap-3 p-3.5">
        <span className="text-3xl">{reward.emoji}</span>
        <div className="min-w-0">
          <p className="text-ink-3 text-[11px] font-bold">{reward.brand}</p>
          <p className="font-hand text-2xl leading-tight">{reward.title}</p>
        </div>
      </div>

      <dl className="mt-4 space-y-1.5 text-[13px]">
        <Row label="교환 금액" value={`-${reward.priceMeow.toLocaleString()} MEOW`} accent="clay" />
        <Row label="현재 잔액" value={`${balance.toLocaleString()} MEOW`} />
        <Row
          label="교환 후 잔액"
          value={`${Math.max(0, balance - reward.priceMeow).toLocaleString()} MEOW`}
          accent="sage"
        />
      </dl>

      {error && <p className="text-clay font-hand mt-3 text-xl leading-tight">{error}</p>}

      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          const res = await onConfirm(reward)
          if (res.status !== 'success') setError(res.message)
          setBusy(false)
        }}
        className="sketch-soft sketch-press bg-honey font-hand mt-4 w-full py-3 text-2xl leading-none disabled:opacity-60"
      >
        {busy ? '교환 처리 중…' : '교환하기'}
      </button>
      <p className="text-ink-3 mt-2 text-center text-[10px]">교환된 $MEOW는 환불되지 않습니다.</p>
    </BottomSheet>
  )
}

function Row({ label, value, accent }: { label: string; value: string; accent?: 'sage' | 'clay' }) {
  const color = accent === 'sage' ? 'text-sage' : accent === 'clay' ? 'text-clay' : 'text-ink'
  return (
    <div className="flex items-center justify-between">
      <dt className="text-ink-2">{label}</dt>
      <dd className={`font-hand text-xl leading-none ${color}`}>{value}</dd>
    </div>
  )
}

/* ───────────────────────── 발급된 기프티콘 ───────────────────────── */

function GiftcardSheet({ card, onClose }: { card: Giftcard | null; onClose: () => void }) {
  if (!card) return null

  return (
    <BottomSheet open onClose={onClose} title="기프티콘">
      <div className="sketch-dashed bg-honey/12 tilt-r p-5 text-center">
        <span className="text-5xl">{card.emoji}</span>
        <p className="text-ink-3 mt-3 text-[11px] font-bold">{card.brand}</p>
        <p className="font-hand text-3xl leading-tight">{card.title}</p>

        {/* 목업 바코드 */}
        <div className="border-ink mt-4 flex h-14 items-end justify-center gap-[3px] rounded-2xl border-[2.5px] bg-white px-4 py-2">
          {Array.from({ length: 34 }, (_, i) => (
            <span
              key={i}
              className="w-[2px] bg-[#34302a]"
              style={{ height: `${40 + ((card.code.charCodeAt(i % card.code.length) * 7) % 60)}%` }}
            />
          ))}
        </div>

        <p className="text-ink mt-3 font-mono text-[15px] font-bold tracking-wider">{card.code}</p>
        <p className="text-ink-3 mt-1 text-[10px]">
          유효기간 {card.expiresAt.slice(0, 10)} · 매장에서 바코드를 제시하세요 (목업)
        </p>
      </div>

      <button
        type="button"
        onClick={onClose}
        className="sketch-soft sketch-press bg-paper-2 font-hand mt-4 w-full py-3 text-2xl leading-none"
      >
        확인
      </button>
    </BottomSheet>
  )
}

/* ───────────────────────── utils ───────────────────────── */

/** 잔액 카운트업 애니메이션 */
function useCountUp(target: number, durationMs = 600): number {
  const [value, setValue] = useState(target)
  const fromRef = useRef(target)

  useEffect(() => {
    const from = fromRef.current
    if (from === target) return
    const startedAt = performance.now()
    let raf = 0

    const step = (now: number) => {
      const t = Math.min(1, (now - startedAt) / durationMs)
      const eased = 1 - (1 - t) ** 3
      setValue(Math.round(from + (target - from) * eased))
      if (t < 1) raf = requestAnimationFrame(step)
      else fromRef.current = target
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [target, durationMs])

  return value
}

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diffMs / 60000)
  if (min < 1) return '방금'
  if (min < 60) return `${min}분 전`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}시간 전`
  const day = Math.floor(hr / 24)
  if (day < 30) return `${day}일 전`
  return iso.slice(0, 10)
}
