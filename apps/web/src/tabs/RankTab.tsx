import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useApp } from '../store/AppState'
import { CatCard, RARITY, rarityOf } from '../components/CatCard'
import { MeowCoin, Squiggle } from '../components/MeowIcon'
import { MOCK_LEADERBOARD } from '../mock/leaderboard'
import type { CardRarity, CatCardData, RankEntry, Transaction } from '../types'

type View = 'rank' | 'cards'

const MEDALS = ['🥇', '🥈', '🥉']

/** 카드가 되는 획득 트랜잭션 (사용/차감 내역은 카드가 되지 않는다) */
const CARD_TYPES = new Set<Transaction['type']>([
  'watch_reward',
  'checkin_reward',
  'tip_received',
  'referral',
  'adjustment',
])

const SOURCE_LABEL: Record<string, string> = {
  watch_reward: '숏폼 시청 보상',
  checkin_reward: 'O2O 스팟 체크인',
  tip_received: '크리에이터 후원 수령',
  referral: '친구 초대 보상',
  adjustment: '이벤트 보상',
}

export function RankTab() {
  const { user, transactions, balance } = useApp()
  const [view, setView] = useState<View>('rank')

  /** 원장에서 카드 파생 — 별도 컬렉션 없이 "받은 보상 = 카드" */
  const cards = useMemo<CatCardData[]>(
    () =>
      transactions
        .filter((tx) => tx.amount > 0 && CARD_TYPES.has(tx.type) && tx.status !== 'reversed')
        .map((tx) => ({
          cardId: tx.txId,
          seed: tx.idempotencyKey || tx.txId,
          amount: tx.amount,
          rarity: rarityOf(tx.amount),
          title: tx.refLabel ?? SOURCE_LABEL[tx.type] ?? '보상',
          source: SOURCE_LABEL[tx.type] ?? '보상',
          earnedAt: tx.createdAt,
          txType: tx.type,
          idempotencyKey: tx.idempotencyKey,
        }))
        .sort((a, b) => b.earnedAt.localeCompare(a.earnedAt)),
    [transactions],
  )

  /** 목업 리더보드에 현재 유저를 실제 원장 값으로 끼워 넣는다 */
  const { ranked, myRank } = useMemo(() => {
    const earned = user?.lifetimeEarned ?? 0
    const me: RankEntry = {
      uid: user?.uid ?? 'me',
      nickname: user?.nickname ?? '나',
      lifetimeEarned: earned,
      cardCount: cards.length,
      streakDays: 4,
      isMe: true,
    }
    const list = [...MOCK_LEADERBOARD, me].sort((a, b) => b.lifetimeEarned - a.lifetimeEarned)
    return { ranked: list, myRank: list.findIndex((e) => e.isMe) + 1 }
  }, [user, cards.length])

  if (!user) return null

  return (
    <div className="paper no-scrollbar h-full overflow-y-auto pb-24">
      {/* 내 순위 카드 */}
      <section className="px-4 pt-[max(16px,env(safe-area-inset-top))]">
        <div className="sketch tilt-r bg-paper-2 p-4">
          <div className="flex items-center justify-between">
            <span className="text-ink-2 font-hand text-xl leading-none">이번 시즌 내 순위</span>
            <span className="text-ink-3 font-hand text-base leading-none">{ranked.length}명 중</span>
          </div>

          <div className="mt-1.5 flex items-end gap-2">
            <span className="font-hand text-[44px] leading-none font-bold">{myRank}</span>
            <span className="text-ink-2 font-hand mb-1.5 text-2xl leading-none">위</span>
            <span className="font-hand text-honey-2 mb-1.5 ml-auto flex items-center gap-1 text-xl leading-none">
              <MeowCoin className="h-5 w-5" />
              {user.lifetimeEarned.toLocaleString()} 누적
            </span>
          </div>
          <Squiggle className="mt-0.5 h-2 w-28" />

          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <MiniStat label="보유 카드" value={`${cards.length}장`} />
            <MiniStat label="현재 잔액" value={balance.toLocaleString()} />
            <MiniStat label="연속 출석" value="4일" />
          </div>
        </div>
      </section>

      {/* 뷰 전환 */}
      <div className="sticky top-0 z-10 px-4 pt-4 pb-2">
        <div className="paper border-line flex gap-1 rounded-full border-2 p-1">
          <SegButton on={view === 'rank'} onClick={() => setView('rank')}>
            🏆 랭킹
          </SegButton>
          <SegButton on={view === 'cards'} onClick={() => setView('cards')}>
            🐱 내 카드 {cards.length}
          </SegButton>
        </div>
      </div>

      {view === 'rank' ? (
        <Leaderboard entries={ranked} />
      ) : (
        <CardCollection cards={cards} />
      )}
    </div>
  )
}

/* ───────────────────────── 랭킹 ───────────────────────── */

function Leaderboard({ entries }: { entries: RankEntry[] }) {
  return (
    <section className="px-4">
      <ul className="space-y-2">
        {entries.map((entry, i) => {
          const rank = i + 1
          return (
            <li
              key={entry.uid}
              className={`flex items-center gap-3 px-3 py-2.5 ${
                entry.isMe ? 'sketch-soft border-honey bg-honey/20' : 'sketch-thin bg-paper-2'
              }`}
            >
              <span className="font-hand w-8 shrink-0 text-center text-2xl leading-none">
                {MEDALS[i] ?? rank}
              </span>

              <span className="border-ink bg-paper-3 font-hand flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 text-lg leading-none">
                {entry.nickname.slice(0, 1)}
              </span>

              <span className="min-w-0 flex-1">
                <span className="font-hand block truncate text-xl leading-tight">
                  {entry.nickname}
                  {entry.isMe && <span className="text-honey-2 ml-1 text-base">(나)</span>}
                </span>
                <span className="text-ink-3 block text-[11px]">
                  카드 {entry.cardCount}장 · {entry.streakDays}일 연속
                </span>
              </span>

              <span className="font-hand text-honey-2 shrink-0 text-xl leading-none">
                {entry.lifetimeEarned.toLocaleString()}
              </span>
            </li>
          )
        })}
      </ul>

      <p className="text-ink-3 mt-3 text-center text-[10px] leading-relaxed">
        누적 획득 $MEOW 기준입니다. 사용한 토큰은 순위에서 차감되지 않습니다.
        <br />
        어뷰징으로 회수된 보상(reversed)은 집계에서 제외됩니다.
      </p>
    </section>
  )
}

/* ───────────────────────── 카드 컬렉션 ───────────────────────── */

function CardCollection({ cards }: { cards: CatCardData[] }) {
  const counts = useMemo(() => {
    const acc: Record<CardRarity, number> = { legend: 0, epic: 0, rare: 0, normal: 0 }
    for (const c of cards) acc[c.rarity]++
    return acc
  }, [cards])

  if (!cards.length) {
    return (
      <section className="px-4 pt-8 text-center">
        <p className="text-6xl opacity-30">🐈</p>
        <p className="font-hand text-ink-2 mt-3 text-2xl leading-tight">아직 카드가 없어요</p>
        <p className="text-ink-3 mt-1 text-[12px] leading-relaxed">
          영상을 보거나 스팟에 체크인해서 $MEOW를 받으면
          <br />
          고양이 카드가 한 장씩 쌓입니다.
        </p>
      </section>
    )
  }

  return (
    <section className="px-4">
      {/* 희귀도 요약 */}
      <div className="mb-3 flex flex-wrap gap-1.5">
        {(['legend', 'epic', 'rare', 'normal'] as CardRarity[]).map((r) => (
          <span
            key={r}
            className={`font-hand rounded-full border-2 px-2 py-0.5 text-base leading-none ${RARITY[r].ring} ${RARITY[r].bg} ${RARITY[r].text}`}
          >
            {RARITY[r].label} {counts[r]}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {cards.map((card, i) => (
          <CatCard key={card.cardId} card={card} index={i} />
        ))}
      </div>

      <p className="text-ink-3 mt-4 text-center text-[10px] leading-relaxed">
        카드를 누르면 뒤집혀서 어떤 보상에서 나왔는지 볼 수 있어요.
        <br />
        고양이 생김새는 원장의 멱등 키로 생성되어 항상 같습니다.
      </p>
    </section>
  )
}

/* ───────────────────────── 소품 ───────────────────────── */

function SegButton({
  on,
  onClick,
  children,
}: {
  on: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`font-hand flex-1 rounded-full py-1.5 text-lg leading-none transition-colors ${
        on ? 'border-ink bg-honey/35 border-2 font-bold' : 'text-ink-3'
      }`}
    >
      {children}
    </button>
  )
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="sketch-thin bg-paper-3 py-1.5">
      <p className="text-ink-3 text-[10px] font-bold">{label}</p>
      <p className="font-hand mt-0.5 text-lg leading-none">{value}</p>
    </div>
  )
}
