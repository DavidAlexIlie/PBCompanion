// Types shared across main, preload and renderer.

export type UserStatus = 'in_progress' | 'completed' | 'dnf'

export interface Problem {
  id: number
  slug: string | null
  title: string | null
  url: string | null
  statement_html: string | null
  detected_score: number | null
  user_status: UserStatus | null // null => derive display status from detected_score
  marked: number // 0 | 1 — manual highlight (yellow outline), overrides score color
  board_x: number | null
  board_y: number | null
  sort_index: number
  created_at: string
  updated_at: string
}

export interface Attempt {
  id: number
  problem_id: number
  source_code: string | null // null => "not captured"
  score: number | null
  submitted_at: string
}

export interface Group {
  id: number
  name: string
  color: string | null
  icon: string | null
  folder_path: string | null
  sort_index: number
  created_at: string
}

export interface GroupWithMembers extends Group {
  problemIds: number[]
}

export interface AppSettings {
  keepOnlyBest: boolean
  autoMoveOnHundred: boolean
  bandPartialMin: number // score >= this and < 100 => partial (amber). default 1
  bandCompleted: number // score >= this => completed (blue). default 100
  dataDir: string
}

// Payload sent by the inject script when it detects a problem page.
export interface DetectedProblem {
  id: number
  slug: string
  title: string
  url: string
  statementHtml: string | null
}

// Payload sent by the inject script when it reads a submission verdict.
export interface DetectedVerdict {
  problemId: number
  score: number | null
  sourceCode: string | null
  timestamp: string
  testsTotal?: number
  testsFailed?: number
}

export interface CompileRunResult {
  ok: boolean
  phase: 'compile' | 'run' | 'compiler_missing'
  stdout: string
  stderr: string
  exitCode: number | null
  timedOut: boolean
  compiler?: string
  outputFile?: string
}

export interface SubmitSolutionResult {
  ok: boolean
  message?: string
}

export interface ProblemIoFiles {
  inputFile: string | null
  outputFile: string | null
}

// The webview layout region reported by the renderer to position the WebContentsView.
export interface ViewBounds {
  x: number
  y: number
  width: number
  height: number
  visible: boolean
}

export interface PbinfoNavState {
  url: string
  canGoBack: boolean
  canGoForward: boolean
  loading: boolean
}
