/**
 * theme.ts — light/dark switching for every renderer window.
 *
 * The palette itself lives in CSS variables (index.css); all this does is put
 * (or remove) the `dark` class on <html>. The chosen theme is persisted in the
 * DB via settings, and mirrored into localStorage so a window can paint the
 * right colours on its very first frame instead of flashing white.
 */
import { useEffect } from 'react'
import type { ThemeName } from '../../../shared/types'

const CACHE_KEY = 'ui.theme'

export function applyTheme(theme: ThemeName): void {
  document.documentElement.classList.toggle('dark', theme === 'dark')
  try {
    localStorage.setItem(CACHE_KEY, theme)
  } catch {
    /* private mode / quota — the DB value is the source of truth anyway */
  }
}

/** Last known theme, available synchronously before any IPC round-trip. */
export function cachedTheme(): ThemeName {
  try {
    return localStorage.getItem(CACHE_KEY) === 'dark' ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

/**
 * Keeps this window in sync with the stored theme. Used by the main app and by
 * the pop-out Notes/Whiteboard windows, which have no settings store of their
 * own.
 */
export function useThemeSync(theme?: ThemeName): void {
  useEffect(() => {
    if (theme) applyTheme(theme)
  }, [theme])

  useEffect(() => {
    if (theme === undefined) void window.api.getSettings().then((s) => applyTheme(s.theme))
    return window.api.onSettingsChanged((s) => applyTheme(s.theme))
  }, [theme === undefined])
}
