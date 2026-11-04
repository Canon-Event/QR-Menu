import type { CSSProperties } from 'react'

const paths = {
  home: 'm3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z',
  menu: 'M5 3v7m3-7v7M3 3v5a3 3 0 0 0 6 0V3M6 11v10M18 21V3c-5 3-5 9 0 9',
  photo: 'M4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm-1 14 6-6 5 5 3-3 4 4M8 7h.01',
  grid: 'M3 3h7v7H3Zm11 0h7v7h-7ZM3 14h7v7H3Zm11 0h7v7h-7Z',
  settings: 'm9 3-1 3-3 1-2 3 2 2-1 3 2 3 3-1 3 2 3-2 3 1 2-3-1-3 2-2-2-3-3-1-1-3Zm3 6a3 3 0 1 0 0 6 3 3 0 0 0 0-6',
  search: 'M21 21l-5-5M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14',
  plus: 'M12 4v16M4 12h16',
  check: 'm5 12 4 4L19 6',
  arrow: 'M4 12h16m-6-6 6 6-6 6',
  chevron: 'm9 5 7 7-7 7',
  expand: 'M8 3H3v5m13-5h5v5M3 16v5h5m8 0h5v-5',
  close: 'm5 5 14 14M5 19 19 5',
  monitor: 'M3 4h18v13H3Zm5 17h8m-4-4v4',
  phone: 'M7 2h10v20H7Zm4 17h2',
  help: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm-3 6a3 3 0 1 1 4 3v2m-1 3h.01',
  palette: 'M12 3a9 9 0 1 0 0 18h2a2 2 0 0 0 0-4h-1a1 1 0 0 1 0-2h3a5 5 0 0 0 5-5c0-4-5-7-9-7ZM7 9h.01M12 7h.01M17 10h.01M7 14h.01',
  warning: 'm12 3 10 18H2Zm0 6v5m0 3h.01',
  grip: 'M9 5h.01M15 5h.01M9 12h.01M15 12h.01M9 19h.01M15 19h.01',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  upload: 'M12 16V3m-5 5 5-5 5 5M3 16v5h18v-5',
} as const
export type StudioIconName = keyof typeof paths
export default function StudioIcon({name,style}:{name:StudioIconName;style?:CSSProperties}) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" width="20" height="20" aria-hidden="true" style={style}><path d={paths[name]}/></svg>
}
