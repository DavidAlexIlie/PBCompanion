/**
 * settings.ts — typed app settings.
 *
 * The DB lives *inside* the data directory, so the data-dir choice itself
 * can't live in the DB (chicken/egg). It's stored in a tiny config.json under
 * Electron's userData. Everything else lives in the DB `settings` table.
 */
import { app } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import type { AppSettings, ThemeName } from '../shared/types'
import { getSetting, setSetting } from './db'

interface BootConfig {
  dataDir: string
}

function configPath(): string {
  return join(app.getPath('userData'), 'config.json')
}

export function defaultDataDir(): string {
  return join(app.getPath('userData'), 'pbinfo-data')
}

export function readBootConfig(): BootConfig {
  try {
    if (existsSync(configPath())) {
      const c = JSON.parse(readFileSync(configPath(), 'utf-8'))
      if (c && typeof c.dataDir === 'string') return { dataDir: c.dataDir }
    }
  } catch {
    /* fall through to default */
  }
  return { dataDir: defaultDataDir() }
}

export function writeBootConfig(c: BootConfig): void {
  writeFileSync(configPath(), JSON.stringify(c, null, 2), 'utf-8')
}

const DEFAULTS = {
  keepOnlyBest: false,
  autoMoveOnHundred: true,
  bandPartialMin: 1,
  bandCompleted: 100,
  theme: 'light' as ThemeName
}

export function getSettings(): AppSettings {
  const bool = (k: string, d: boolean): boolean => {
    const v = getSetting(k)
    return v === null ? d : v === 'true'
  }
  const num = (k: string, d: number): number => {
    const v = getSetting(k)
    return v === null ? d : Number(v)
  }
  return {
    keepOnlyBest: bool('keepOnlyBest', DEFAULTS.keepOnlyBest),
    autoMoveOnHundred: bool('autoMoveOnHundred', DEFAULTS.autoMoveOnHundred),
    bandPartialMin: num('bandPartialMin', DEFAULTS.bandPartialMin),
    bandCompleted: num('bandCompleted', DEFAULTS.bandCompleted),
    theme: getSetting('theme') === 'dark' ? 'dark' : DEFAULTS.theme,
    dataDir: readBootConfig().dataDir
  }
}

export function setSettings(patch: Partial<AppSettings>): AppSettings {
  if (patch.keepOnlyBest !== undefined) setSetting('keepOnlyBest', String(patch.keepOnlyBest))
  if (patch.autoMoveOnHundred !== undefined)
    setSetting('autoMoveOnHundred', String(patch.autoMoveOnHundred))
  if (patch.bandPartialMin !== undefined) setSetting('bandPartialMin', String(patch.bandPartialMin))
  if (patch.bandCompleted !== undefined) setSetting('bandCompleted', String(patch.bandCompleted))
  if (patch.theme !== undefined) setSetting('theme', patch.theme)
  return getSettings()
}
