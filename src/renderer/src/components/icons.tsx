// Minimal, consistent inline icons (no icon-font dependency). 1.6 stroke.
import type { JSX } from 'react'

type P = { className?: string }
const base = (children: JSX.Element, p: P): JSX.Element => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.7}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={p.className ?? 'h-5 w-5'}
  >
    {children}
  </svg>
)

export const IconHome = (p: P): JSX.Element =>
  base(<><path d="M3 11.5 12 4l9 7.5" /><path d="M5 10v9a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-9" /></>, p)
export const IconProgress = (p: P): JSX.Element =>
  base(<><circle cx="12" cy="12" r="8" /><path d="M12 8v4l3 2" /></>, p)
export const IconCheck = (p: P): JSX.Element =>
  base(<><circle cx="12" cy="12" r="8" /><path d="m8.5 12 2.5 2.5 4.5-5" /></>, p)
export const IconDnf = (p: P): JSX.Element =>
  base(<><circle cx="12" cy="12" r="8" /><path d="M9 9l6 6M15 9l-6 6" /></>, p)
export const IconGroups = (p: P): JSX.Element =>
  base(<><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>, p)
export const IconBoard = (p: P): JSX.Element =>
  base(<><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16M15 4v16" /></>, p)
export const IconNote = (p: P): JSX.Element =>
  base(<><path d="M5 3h9l5 5v13a0 0 0 0 1 0 0H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" /><path d="M14 3v5h5M8 13h8M8 17h5" /></>, p)
export const IconSettings = (p: P): JSX.Element =>
  base(<><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></>, p)
export const IconBrowser = (p: P): JSX.Element =>
  base(<><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18M7 6.5h.01M10 6.5h.01" /></>, p)
export const IconBack = (p: P): JSX.Element => base(<path d="M15 5l-7 7 7 7" />, p)
export const IconForward = (p: P): JSX.Element => base(<path d="M9 5l7 7-7 7" />, p)
export const IconReload = (p: P): JSX.Element =>
  base(<><path d="M20 11a8 8 0 1 0-.5 4" /><path d="M20 4v5h-5" /></>, p)
export const IconTrash = (p: P): JSX.Element =>
  base(<><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" /></>, p)
export const IconClose = (p: P): JSX.Element => base(<path d="M6 6l12 12M18 6 6 18" />, p)
export const IconPlus = (p: P): JSX.Element => base(<path d="M12 5v14M5 12h14" />, p)
export const IconExternal = (p: P): JSX.Element =>
  base(<><path d="M14 4h6v6" /><path d="M20 4 10 14" /><path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5" /></>, p)
export const IconExpand = (p: P): JSX.Element =>
  base(<><path d="M4 9V4h5M20 15v5h-5M4 4l6 6M20 20l-6-6" /></>, p)
export const IconCollapse = (p: P): JSX.Element =>
  base(<><path d="M9 4H4v5M15 20h5v-5M4 4l5 5M20 20l-5-5" /></>, p)

// A small icon set users can pick for groups.
export const GROUP_ICONS: Record<string, (p: P) => JSX.Element> = {
  folder: (p) => base(<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />, p),
  star: (p) => base(<path d="m12 4 2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.5-4.8 2.5.9-5.4L4.2 9.7l5.4-.8z" />, p),
  flag: (p) => base(<><path d="M5 21V4" /><path d="M5 4h12l-2 4 2 4H5" /></>, p),
  bolt: (p) => base(<path d="M13 3 4 14h7l-1 7 9-11h-7z" />, p),
  book: (p) => base(<><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z" /><path d="M19 3v18" /></>, p),
  code: (p) => base(<><path d="m8 9-3 3 3 3M16 9l3 3-3 3M13 7l-2 10" /></>, p),
  heart: (p) => base(<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 1 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z" />, p),
  target: (p) => base(<><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="4" /><circle cx="12" cy="12" r="1" /></>, p)
}
