type IconProps = { className?: string }
export function IconChevronRight({ className }: IconProps) {
  return <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true"><path d="m9 5 7 7-7 7" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /></svg>
}

export function IconExternalLink({ className }: IconProps) {
  return <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true"><path d="M14 5h5v5M19 5l-8 8" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" /><path d="M18 13v5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" /></svg>
}

export function IconDownloadSmall({ className }: IconProps) {
  return <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true"><path d="M12 4v10m-4-3 4 4 4-4M5 20h14" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" /></svg>
}
export function IconLogOut({ className }: IconProps) {
  return <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true"><path d="M10 5H6a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h4M14 8l4 4-4 4M9 12h9" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" /></svg>
}

export function IconArrowRight({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function IconPlay({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx={12} cy={12} r={9} stroke="currentColor" strokeWidth={1.6} />
      <path d="M10.5 9l4 3-4 3V9z" fill="currentColor" />
    </svg>
  )
}

export function IconStar({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.6l-5.9 3 1.3-6.6-4.9-4.6 6.6-.8L12 2.5z" />
    </svg>
  )
}

export function IconCircleSlash({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx={12} cy={12} r={9} stroke="currentColor" strokeWidth={1.6} />
      <path d="M6.5 6.5l11 11" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" />
    </svg>
  )
}

export function IconDownload({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M12 4v11" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" />
      <path d="M7.5 11.5L12 16l4.5-4.5" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 19.5h14" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" />
    </svg>
  )
}

export function IconRefresh({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M4 4v5h5M20 20v-5h-5" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5.5 15a7.5 7.5 0 0013 3.5M18.5 9a7.5 7.5 0 00-13-3.5" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function IconPhone({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <rect x={7} y={2.5} width={10} height={19} rx={2} stroke="currentColor" strokeWidth={1.6} />
      <path d="M11 18.5h2" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" />
    </svg>
  )
}

export function IconTrendingUp({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M3 17l6-6 4 4 8-9" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M15 6h6v6" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function IconPencil({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M4 20l1-4.5L15.5 5l3.5 3.5L8.5 19 4 20z" stroke="currentColor" strokeWidth={1.6} strokeLinejoin="round" />
    </svg>
  )
}

export function IconQrCode({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <rect x={3} y={3} width={7} height={7} rx={1} stroke="currentColor" strokeWidth={1.6} />
      <rect x={14} y={3} width={7} height={7} rx={1} stroke="currentColor" strokeWidth={1.6} />
      <rect x={3} y={14} width={7} height={7} rx={1} stroke="currentColor" strokeWidth={1.6} />
      <path d="M14 14h3v3h-3zM20 14v3M17 20h4" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" />
    </svg>
  )
}

export function IconUsers({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx={9} cy={8} r={3} stroke="currentColor" strokeWidth={1.6} />
      <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" />
      <path d="M16 8.2a3 3 0 010 5.7M19.5 20c-.2-2.6-1.5-4.5-3.5-5.5" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" />
    </svg>
  )
}

export function IconGift({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <rect x={3.5} y={9} width={17} height={11} rx={1.5} stroke="currentColor" strokeWidth={1.6} />
      <path d="M3.5 9h17M12 9v11" stroke="currentColor" strokeWidth={1.6} />
      <path d="M12 9C9 9 8 7.5 8 6.2 8 5 9 4 10.2 4 11.8 4 12 7 12 9zM12 9c3 0 4-1.5 4-2.8C16 5 15 4 13.8 4 12.2 4 12 7 12 9z" stroke="currentColor" strokeWidth={1.4} strokeLinejoin="round" />
    </svg>
  )
}

export function IconHeadset({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M4 13v-1a8 8 0 0116 0v1" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" />
      <rect x={3} y={13} width={4} height={6} rx={1.5} stroke="currentColor" strokeWidth={1.6} />
      <rect x={17} y={13} width={4} height={6} rx={1.5} stroke="currentColor" strokeWidth={1.6} />
      <path d="M19 19v1a2 2 0 01-2 2h-3" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" />
    </svg>
  )
}

export function IconCalendarCheck({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <rect x={3.5} y={5} width={17} height={16} rx={2} stroke="currentColor" strokeWidth={1.6} />
      <path d="M3.5 9.5h17M8 3v4M16 3v4" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" />
      <path d="M8.5 14l2 2 4-4" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function IconShieldCheck({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" stroke="currentColor" strokeWidth={1.6} strokeLinejoin="round" />
      <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function IconCheck({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx={12} cy={12} r={10} className="fill-current opacity-15" />
      <path d="M8 12.5l2.5 2.5L16 9" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function IconCrown({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M4 8l4 3 4-6 4 6 4-3-2 10H6L4 8z" stroke="currentColor" strokeWidth={1.6} strokeLinejoin="round" />
    </svg>
  )
}

export function IconLeaf({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M6 20C4 12 8 5 19 4c1 10-6 15-13 16z" stroke="currentColor" strokeWidth={1.6} strokeLinejoin="round" />
      <path d="M7 19c3-5 6-8 11-13" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" />
    </svg>
  )
}

export function IconSend({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M4 12.5l16-8-6 16-2.5-6.5L4 12.5z" stroke="currentColor" strokeWidth={1.6} strokeLinejoin="round" />
      <path d="M11.5 14L16 9.5" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" />
    </svg>
  )
}

export function IconFacebook({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M14 22v-8.5h2.9l.4-3.4H14V8c0-1 .3-1.7 1.7-1.7H17.5V3.2C17.1 3.1 16 3 14.7 3 12 3 10.2 4.6 10.2 7.6v2.5H7.3v3.4h2.9V22h3.8z" />
    </svg>
  )
}

export function IconInstagram({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <rect x={3.5} y={3.5} width={17} height={17} rx={5} stroke="currentColor" strokeWidth={1.6} />
      <circle cx={12} cy={12} r={4.2} stroke="currentColor" strokeWidth={1.6} />
      <circle cx={17.1} cy={6.9} r={1} fill="currentColor" />
    </svg>
  )
}

export function IconLinkedin({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <rect x={3} y={3} width={18} height={18} rx={3} fill="none" stroke="currentColor" strokeWidth={1.4} />
      <circle cx={7.6} cy={8.2} r={1.15} />
      <path d="M6.6 10.8h2v7h-2zM10.4 10.8h1.9v1c.5-.8 1.3-1.2 2.3-1.2 1.9 0 2.9 1.2 2.9 3.4v3.8h-2v-3.4c0-1-.4-1.7-1.3-1.7-.7 0-1.2.5-1.4 1-.1.2-.1.4-.1.7v3.4h-2v-7z" stroke="none" />
    </svg>
  )
}

export function IconTwitter({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M21 5.6c-.7.3-1.4.5-2.2.6.8-.5 1.4-1.2 1.6-2.1-.7.4-1.5.7-2.4.9A3.7 3.7 0 0012.1 8c0 .3 0 .6.1.8-3.1-.1-5.8-1.6-7.6-3.9-.3.6-.5 1.2-.5 1.9 0 1.3.7 2.5 1.7 3.1-.6 0-1.2-.2-1.7-.5v.1c0 1.9 1.3 3.4 3.1 3.8-.3.1-.7.1-1 .1-.3 0-.5 0-.7-.1.5 1.5 1.9 2.6 3.6 2.7A7.5 7.5 0 013 18.1a10.6 10.6 0 005.7 1.6c6.9 0 10.6-5.6 10.6-10.5v-.5c.7-.5 1.3-1.2 1.8-2z" />
    </svg>
  )
}
