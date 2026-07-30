import type { ReactElement } from 'react'
import { PawIcon, PinIcon, WalletIcon } from './MeowIcon'

export type TabKey = 'feed' | 'map' | 'wallet'

const TABS: { key: TabKey; label: string; Icon: (p: { className?: string }) => ReactElement }[] = [
  { key: 'feed', label: '피드', Icon: PawIcon },
  { key: 'map', label: '지도', Icon: PinIcon },
  { key: 'wallet', label: '지갑', Icon: WalletIcon },
]

export function TabBar({ active, onChange }: { active: TabKey; onChange: (key: TabKey) => void }) {
  return (
    <nav className="border-ink paper absolute inset-x-0 bottom-0 z-30 border-t-[3px] pb-[env(safe-area-inset-bottom)]">
      <ul className="flex items-end px-3 py-2">
        {TABS.map(({ key, label, Icon }) => {
          const on = key === active
          return (
            <li key={key} className="flex-1">
              <button
                type="button"
                onClick={() => onChange(key)}
                aria-current={on ? 'page' : undefined}
                className={`sketch-press flex w-full flex-col items-center gap-0.5 rounded-2xl py-1.5 ${
                  on ? 'sketch-pill bg-honey/25 text-ink' : 'text-ink-3'
                }`}
              >
                <Icon className="h-6 w-6" />
                <span className={`font-hand text-lg leading-none ${on ? 'font-bold' : ''}`}>{label}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
