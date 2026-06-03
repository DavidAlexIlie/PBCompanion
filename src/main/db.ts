/**
 * db.ts — local-first SQLite store. Everything the user organizes lives here
 * (plus real folders on disk for groups, created in groups.ts). The DB file
 * lives under the configured data directory.
 */
import Database from 'better-sqlite3'
import { join } from 'path'
import { mkdirSync } from 'fs'
import type {
  Problem,
  Attempt,
  Group,
  GroupWithMembers,
  UserStatus,
  DetectedProblem
} from '../shared/types'
import { cleanSourceCode } from '../shared/sourceCode'

let db: Database.Database

const SCHEMA = `
CREATE TABLE IF NOT EXISTS problems (
  id             INTEGER PRIMARY KEY,
  slug           TEXT,
  title          TEXT,
  url            TEXT,
  statement_html TEXT,
  detected_score INTEGER,
  user_status    TEXT,
  board_x        REAL,
  board_y        REAL,
  sort_index     INTEGER DEFAULT 0,
  created_at     TEXT,
  updated_at     TEXT
);

CREATE TABLE IF NOT EXISTS attempts (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  problem_id   INTEGER REFERENCES problems(id) ON DELETE CASCADE,
  source_code  TEXT,
  score        INTEGER,
  submitted_at TEXT
);

CREATE TABLE IF NOT EXISTS groups (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  color       TEXT,
  icon        TEXT,
  folder_path TEXT,
  sort_index  INTEGER DEFAULT 0,
  created_at  TEXT
);

CREATE TABLE IF NOT EXISTS group_problems (
  group_id   INTEGER REFERENCES groups(id) ON DELETE CASCADE,
  problem_id INTEGER REFERENCES problems(id) ON DELETE CASCADE,
  sort_index INTEGER DEFAULT 0,
  PRIMARY KEY (group_id, problem_id)
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);

-- Per-problem notes + whiteboard. Kept out of the problems row so listing
-- problems never drags along (potentially large) whiteboard data.
CREATE TABLE IF NOT EXISTS problem_docs (
  problem_id INTEGER PRIMARY KEY REFERENCES problems(id) ON DELETE CASCADE,
  notes      TEXT,
  whiteboard TEXT,
  updated_at TEXT
);
`

export function initDb(dataDir: string): Database.Database {
  mkdirSync(dataDir, { recursive: true })
  db = new Database(join(dataDir, 'pbinfo-organizer.db'))
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.exec(SCHEMA)
  migrate()
  return db
}

/** Additive migrations for DBs created by older versions. */
function migrate(): void {
  const cols = (db.prepare('PRAGMA table_info(problems)').all() as { name: string }[]).map(
    (c) => c.name
  )
  if (!cols.includes('marked')) {
    db.exec('ALTER TABLE problems ADD COLUMN marked INTEGER DEFAULT 0')
  }
}

export function getDb(): Database.Database {
  if (!db) throw new Error('DB not initialized')
  return db
}

const now = (): string => new Date().toISOString()

// ---- problems ----------------------------------------------------------
export function listProblems(): Problem[] {
  return getDb().prepare('SELECT * FROM problems ORDER BY sort_index ASC, id ASC').all() as Problem[]
}

export function getProblem(id: number): Problem | undefined {
  return getDb().prepare('SELECT * FROM problems WHERE id = ?').get(id) as Problem | undefined
}

/** Register a detected problem. New problems default to In Progress. Existing
 *  ones get their slug/title/url/statement refreshed (never clobber status). */
export function registerProblem(p: DetectedProblem): Problem {
  const existing = getProblem(p.id)
  const t = now()
  if (existing) {
    getDb()
      .prepare(
        `UPDATE problems SET slug=?, title=COALESCE(?, title), url=?,
           statement_html=COALESCE(?, statement_html), updated_at=? WHERE id=?`
      )
      .run(p.slug, p.title, p.url, p.statementHtml, t, p.id)
  } else {
    const maxSort =
      (getDb().prepare('SELECT MAX(sort_index) AS m FROM problems').get() as { m: number | null })
        .m ?? 0
    // user_status starts NULL: the problem is "not manually placed". Its
    // displayed lane derives from detected_score (=> In Progress until scored),
    // and auto-move stays enabled until the user drags it somewhere.
    getDb()
      .prepare(
        `INSERT INTO problems
           (id, slug, title, url, statement_html, detected_score, user_status, sort_index, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?)`
      )
      .run(p.id, p.slug, p.title, p.url, p.statementHtml, null, null, maxSort + 1, t, t)
  }
  return getProblem(p.id)!
}

/** Update only the cached metadata (used when a known problem page re-detects). */
export function refreshProblemMeta(p: DetectedProblem): void {
  registerProblem(p)
}

export function setProblemStatus(id: number, status: UserStatus, sortIndex?: number): void {
  if (sortIndex === undefined) {
    getDb()
      .prepare('UPDATE problems SET user_status=?, updated_at=? WHERE id=?')
      .run(status, now(), id)
  } else {
    getDb()
      .prepare('UPDATE problems SET user_status=?, sort_index=?, updated_at=? WHERE id=?')
      .run(status, sortIndex, now(), id)
  }
}

/** Persist ordering only (sort_index). Status is set separately, and only for
 *  the token the user actually dragged — so reordering a lane never silently
 *  marks every token as "manually placed". */
export function reorderProblems(orderedIds: number[]): void {
  const stmt = getDb().prepare('UPDATE problems SET sort_index=? WHERE id=?')
  const tx = getDb().transaction((ids: number[]) => {
    ids.forEach((id, i) => stmt.run(i, id))
  })
  tx(orderedIds)
}

export function deleteProblem(id: number): void {
  getDb().prepare('DELETE FROM problems WHERE id=?').run(id)
}

export function setProblemMarked(id: number, marked: boolean): void {
  getDb()
    .prepare('UPDATE problems SET marked=?, updated_at=? WHERE id=?')
    .run(marked ? 1 : 0, now(), id)
}

// ---- per-problem notes + whiteboard -----------------------------------
export function getProblemDoc(id: number): { notes: string; whiteboard: string } {
  const row = getDb()
    .prepare('SELECT notes, whiteboard FROM problem_docs WHERE problem_id=?')
    .get(id) as { notes: string | null; whiteboard: string | null } | undefined
  return { notes: row?.notes ?? '', whiteboard: row?.whiteboard ?? '' }
}

function upsertDoc(id: number, field: 'notes' | 'whiteboard', value: string): void {
  getDb()
    .prepare(
      `INSERT INTO problem_docs (problem_id, ${field}, updated_at) VALUES (?,?,?)
       ON CONFLICT(problem_id) DO UPDATE SET ${field}=excluded.${field}, updated_at=excluded.updated_at`
    )
    .run(id, value, now())
}

export function saveProblemNotes(id: number, notes: string): void {
  upsertDoc(id, 'notes', notes)
}

export function saveProblemWhiteboard(id: number, whiteboard: string): void {
  upsertDoc(id, 'whiteboard', whiteboard)
}

/**
 * detected_score is DERIVED, not a high-water mark: it is the best score among
 * the problem's recorded attempts (NULL when there are none). Recompute it
 * whenever attempts change so the score always reflects the attempt history —
 * delete every attempt and the score drops back to "no score". Returns the
 * recomputed value.
 */
export function recomputeDetectedScore(problemId: number): number | null {
  const row = getDb()
    .prepare('SELECT MAX(score) AS m FROM attempts WHERE problem_id=?')
    .get(problemId) as { m: number | null }
  const best = row?.m ?? null
  getDb()
    .prepare('UPDATE problems SET detected_score=?, updated_at=? WHERE id=?')
    .run(best, now(), problemId)
  return best
}

/** Recompute the derived score and auto-move to Completed on >=threshold, but
 *  only when the user has NOT manually placed the problem (manual wins). */
export function applyDetectedScore(
  problemId: number,
  opts: { autoMove: boolean; completedThreshold: number }
): void {
  const p = getProblem(problemId)
  if (!p) return
  const best = recomputeDetectedScore(problemId)
  if (opts.autoMove && best !== null && best >= opts.completedThreshold && p.user_status === null) {
    setProblemStatus(problemId, 'completed')
  }
}

// ---- attempts ----------------------------------------------------------
export function listAttempts(problemId: number): Attempt[] {
  return getDb()
    .prepare('SELECT * FROM attempts WHERE problem_id=? ORDER BY submitted_at DESC, id DESC')
    .all(problemId) as Attempt[]
}

export function addAttempt(
  problemId: number,
  sourceCode: string | null,
  score: number | null,
  submittedAt: string
): void {
  getDb()
    .prepare(
      'INSERT INTO attempts (problem_id, source_code, score, submitted_at) VALUES (?,?,?,?)'
    )
    .run(problemId, sourceCode ? cleanSourceCode(sourceCode) : null, score, submittedAt)
}

/** Delete an attempt; returns the problem it belonged to so the caller can
 *  recompute that problem's derived score. */
export function deleteAttempt(attemptId: number): number | null {
  const row = getDb()
    .prepare('SELECT problem_id FROM attempts WHERE id=?')
    .get(attemptId) as { problem_id: number } | undefined
  getDb().prepare('DELETE FROM attempts WHERE id=?').run(attemptId)
  return row?.problem_id ?? null
}

/** Keep only the single highest-scoring attempt per problem (destructive). */
export function keepOnlyBestAttempts(): void {
  getDb().exec(`
    DELETE FROM attempts WHERE id NOT IN (
      SELECT id FROM (
        SELECT id,
          ROW_NUMBER() OVER (
            PARTITION BY problem_id
            ORDER BY COALESCE(score,-1) DESC, submitted_at DESC, id DESC
          ) AS rn
        FROM attempts
      ) WHERE rn = 1
    );
  `)
}

// ---- groups ------------------------------------------------------------
export function listGroups(): GroupWithMembers[] {
  const groups = getDb()
    .prepare('SELECT * FROM groups ORDER BY sort_index ASC, id ASC')
    .all() as Group[]
  const members = getDb()
    .prepare('SELECT group_id, problem_id FROM group_problems ORDER BY sort_index ASC')
    .all() as { group_id: number; problem_id: number }[]
  return groups.map((g) => ({
    ...g,
    problemIds: members.filter((m) => m.group_id === g.id).map((m) => m.problem_id)
  }))
}

export function createGroup(name: string, color: string, icon: string, folderPath: string): Group {
  const maxSort =
    (getDb().prepare('SELECT MAX(sort_index) AS m FROM groups').get() as { m: number | null }).m ??
    0
  const info = getDb()
    .prepare(
      'INSERT INTO groups (name, color, icon, folder_path, sort_index, created_at) VALUES (?,?,?,?,?,?)'
    )
    .run(name, color, icon, folderPath, maxSort + 1, now())
  return getDb().prepare('SELECT * FROM groups WHERE id=?').get(info.lastInsertRowid) as Group
}

export function getGroup(id: number): Group | undefined {
  return getDb().prepare('SELECT * FROM groups WHERE id=?').get(id) as Group | undefined
}

export function updateGroup(
  id: number,
  patch: { name?: string; color?: string; icon?: string }
): void {
  const g = getGroup(id)
  if (!g) return
  getDb()
    .prepare('UPDATE groups SET name=?, color=?, icon=? WHERE id=?')
    .run(patch.name ?? g.name, patch.color ?? g.color, patch.icon ?? g.icon, id)
}

export function deleteGroup(id: number): void {
  getDb().prepare('DELETE FROM groups WHERE id=?').run(id)
}

export function addProblemToGroup(groupId: number, problemId: number): void {
  const maxSort =
    (
      getDb()
        .prepare('SELECT MAX(sort_index) AS m FROM group_problems WHERE group_id=?')
        .get(groupId) as { m: number | null }
    ).m ?? 0
  getDb()
    .prepare(
      'INSERT OR IGNORE INTO group_problems (group_id, problem_id, sort_index) VALUES (?,?,?)'
    )
    .run(groupId, problemId, maxSort + 1)
}

export function removeProblemFromGroup(groupId: number, problemId: number): void {
  getDb()
    .prepare('DELETE FROM group_problems WHERE group_id=? AND problem_id=?')
    .run(groupId, problemId)
}

// ---- settings ----------------------------------------------------------
export function getSetting(key: string): string | null {
  const row = getDb().prepare('SELECT value FROM settings WHERE key=?').get(key) as
    | { value: string }
    | undefined
  return row?.value ?? null
}

export function setSetting(key: string, value: string): void {
  getDb()
    .prepare('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=?')
    .run(key, value, value)
}

export function clearOrganizerData(): void {
  getDb().exec('DELETE FROM group_problems; DELETE FROM groups; DELETE FROM attempts; DELETE FROM problems;')
}

export function exportSyncSnapshot(): {
  version: number
  updatedAt: string
  problems: {
    id: number
    slug: string | null
    title: string | null
    detected_score: number | null
    user_status: UserStatus | null
    marked: number
    sort_index: number
    updated_at: string
  }[]
  groups: GroupWithMembers[]
  docs: { problemId: number; notes: string; whiteboard: string; updatedAt: string | null }[]
} {
  const docs = getDb()
    .prepare('SELECT problem_id, notes, whiteboard, updated_at FROM problem_docs')
    .all() as {
    problem_id: number
    notes: string | null
    whiteboard: string | null
    updated_at: string | null
  }[]
  return {
    version: 1,
    updatedAt: now(),
    problems: listProblems().map((problem) => ({
      id: problem.id,
      slug: problem.slug,
      title: problem.title,
      detected_score: problem.detected_score,
      user_status: problem.user_status,
      marked: problem.marked,
      sort_index: problem.sort_index,
      updated_at: problem.updated_at
    })),
    groups: listGroups().map((group) => ({ ...group, folder_path: null })),
    docs: docs.map((doc) => ({
      problemId: doc.problem_id,
      notes: doc.notes ?? '',
      whiteboard: doc.whiteboard ?? '',
      updatedAt: doc.updated_at
    }))
  }
}
