import type { CSSProperties, ReactNode } from 'react'
import { readableInk, type LoyaltyProgram, type StampIcon } from '@/lib/loyalty'

export function StampGlyph({ icon = 'coffee' }: { icon?: StampIcon }) {
  return <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {icon === 'coffee' ? <><path d="M7 12h16v8a6 6 0 0 1-6 6h-4a6 6 0 0 1-6-6zM23 13h2a4 4 0 0 1 0 8h-2M5 29h22M11 7V3M16 7V2M21 7V3" /></> : icon === 'star' ? <path d="m16 3 4 8 9 1.3-6.5 6.4 1.5 9-8-4.3-8 4.3 1.5-9L3 12.3l9-1.3z" /> : <><path d="M8 3v10M4 3v6a4 4 0 0 0 8 0V3M8 13v16M24 29V3c-6 3-7 12 0 14" /></>}
  </svg>
}

export default function StampCard({ program, restaurantName, logoUrl, stamps = 0, state = 'collecting', expiry, children }: {
  program: LoyaltyProgram; restaurantName: string; logoUrl?: string; stamps?: number;
  state?: 'guest' | 'collecting' | 'ready'; expiry?: string; children?: ReactNode;
}) {
  const bold = program.card_style === 'bold'
  const background = bold ? program.accent_color : program.background_color
  const ink = readableInk(background)
  const count = Math.max(0, Math.min(stamps, program.stamp_target))
  const style = { '--card-bg': background, '--card-ink': ink, '--stamp-bg': bold ? ink : program.accent_color, '--stamp-ink': bold ? background : readableInk(program.accent_color) } as CSSProperties
  return <article className={`stamp-card stamp-card--${program.card_style} stamp-card--${program.card_font}`} style={style}>
    <header className="stamp-card-brand">
      {logoUrl ? <img src={logoUrl} alt="" className="stamp-card-logo" /> : <span className="stamp-card-monogram" aria-hidden="true">{restaurantName.slice(0, 1)}</span>}
      <span>{restaurantName}</span><small>MEMBER REWARDS</small>
    </header>
    <div className="stamp-card-heading"><span className="stamp-card-eyebrow">{state === 'ready' ? 'A little thank you, on us' : 'A reason to come back'}</span><h2>{state === 'ready' ? 'You’ve earned a treat.' : program.title}</h2><p>{state === 'ready' ? program.reward_name : `Collect ${program.stamp_target} stamps. Enjoy ${program.reward_name.toLowerCase()}.`}</p></div>
    <div className="stamp-card-grid" role="img" aria-label={`${state === 'ready' ? program.stamp_target : count} of ${program.stamp_target} stamps collected`}>
      {Array.from({ length: program.stamp_target }, (_, index) => <span className={`stamp-slot${index < (state === 'ready' ? program.stamp_target : count) ? ' stamp-slot--filled' : ''}`} key={index}>{index < (state === 'ready' ? program.stamp_target : count) ? <StampGlyph icon={program.stamp_icon} /> : <span>{index + 1}</span>}</span>)}
    </div>
    <div className="stamp-card-progress"><strong>{state === 'ready' ? 'Reward unlocked' : `${count} / ${program.stamp_target} stamps`}</strong><span>{state === 'ready' ? 'Made for your next visit' : `${program.stamp_target - count} more to your reward`}</span></div>
    {children}
    <footer className="stamp-card-footer"><span>{expiry || (state === 'ready' ? `Use within ${program.reward_valid_days} days of earning` : `Progress valid for ${program.inactivity_days} days after a qualifying purchase`)}</span><span>✦ WIIT</span></footer>
  </article>
}
