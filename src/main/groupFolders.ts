/**
 * groupFolders.ts — a group is BOTH a DB row AND a real folder on disk
 * (`<dataDir>/groups/<name>/`), so the organization is visible in the
 * filesystem, not locked in an opaque DB.
 */
import { join } from 'path'
import { mkdirSync, renameSync, existsSync } from 'fs'

/** Make a filesystem-safe folder name from a group name. */
export function safeFolderName(name: string): string {
  const cleaned = name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/\s+/g, ' ').trim()
  return cleaned.slice(0, 80) || 'group'
}

export function groupsRoot(dataDir: string): string {
  return join(dataDir, 'groups')
}

/** Ensure a unique folder exists for a new group; returns its absolute path. */
export function ensureGroupFolder(dataDir: string, name: string): string {
  const root = groupsRoot(dataDir)
  mkdirSync(root, { recursive: true })
  const base = safeFolderName(name)
  let folder = join(root, base)
  let i = 2
  while (existsSync(folder)) {
    folder = join(root, `${base} (${i++})`)
  }
  mkdirSync(folder, { recursive: true })
  return folder
}

/** Rename a group's folder when the group is renamed (best-effort). */
export function renameGroupFolder(
  dataDir: string,
  oldPath: string | null,
  newName: string
): string {
  const root = groupsRoot(dataDir)
  mkdirSync(root, { recursive: true })
  const target = join(root, safeFolderName(newName))
  try {
    if (oldPath && existsSync(oldPath) && oldPath !== target && !existsSync(target)) {
      renameSync(oldPath, target)
      return target
    }
    if (!existsSync(target)) mkdirSync(target, { recursive: true })
    return existsSync(target) ? target : oldPath ?? target
  } catch {
    return oldPath ?? target
  }
}
