import { execFile, execFileSync } from 'child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { basename, dirname, join } from 'path'

import type { CompileRunResult, ProblemIoFiles } from '../shared/types'

const COMPILE_TIMEOUT_MS = 20_000
const RUN_TIMEOUT_MS = 5_000

export async function compileAndRun(
  dataDir: string,
  problemId: number,
  source: string,
  input: string,
  ioFiles: ProblemIoFiles
): Promise<CompileRunResult> {
  const workDir = join(dataDir, 'cpp-workspace', `problem-${problemId}`)
  mkdirSync(workDir, { recursive: true })
  const sourcePath = join(workDir, `problem-${problemId}.cpp`)
  const outputPath = join(workDir, `problem-${problemId}.exe`)
  writeFileSync(sourcePath, source, 'utf-8')

  const compiler = findCompiler()
  if (!compiler) {
    return {
      ok: false,
      phase: 'compiler_missing',
      stdout: '',
      stderr: 'No C++ compiler found. Install g++ or place a portable compiler in tools\\mingw64\\bin.',
      exitCode: null,
      timedOut: false
    }
  }

  const compiled = await runProcess(
    compiler,
    [sourcePath, '-std=c++17', '-O2', '-pipe', '-o', outputPath],
    workDir,
    '',
    COMPILE_TIMEOUT_MS,
    dirname(compiler)
  )
  if (!compiled.ok) return { ...compiled, phase: 'compile', compiler }

  const inputFile = safeFileName(ioFiles.inputFile)
  const outputFile = safeFileName(ioFiles.outputFile)
  if (inputFile) writeFileSync(join(workDir, inputFile), input, 'utf-8')
  if (outputFile) rmSync(join(workDir, outputFile), { force: true })

  const executed = await runProcess(outputPath, [], workDir, inputFile ? '' : input, RUN_TIMEOUT_MS)
  if (outputFile && existsSync(join(workDir, outputFile))) {
    executed.stdout = readFileSync(join(workDir, outputFile), 'utf-8')
  }
  return { ...executed, phase: 'run', compiler, outputFile: outputFile ?? undefined }
}

function safeFileName(value: string | null): string | null {
  if (!value) return null
  const clean = basename(value)
  return /^[A-Za-z0-9_-]+\.(?:in|out|txt)$/i.test(clean) ? clean : null
}

function findCompiler(): string | null {
  const candidates = [
    join(process.resourcesPath, 'tools', 'w64devkit', 'bin', 'g++.exe'),
    join(process.cwd(), 'tools', 'mingw64', 'w64devkit', 'bin', 'g++.exe'),
    'C:\\msys64\\ucrt64\\bin\\g++.exe',
    'C:\\msys64\\mingw64\\bin\\g++.exe',
    'C:\\mingw64\\bin\\g++.exe',
    'g++'
  ]
  const local = candidates.find((candidate) => candidate !== 'g++' && existsSync(candidate))
  if (local) return local
  try {
    const result = execFileSync('where.exe', ['g++'], { encoding: 'utf-8', windowsHide: true })
    return result.split(/\r?\n/).find(Boolean) ?? null
  } catch {
    return null
  }
}

function runProcess(
  executable: string,
  args: string[],
  cwd: string,
  input: string,
  timeout: number,
  toolPath?: string
): Promise<Omit<CompileRunResult, 'phase'>> {
  return new Promise((resolve) => {
    const child = execFile(
      executable,
      args,
      {
        cwd,
        timeout,
        windowsHide: true,
        maxBuffer: 2 * 1024 * 1024,
        env: toolPath ? { ...process.env, PATH: `${toolPath};${process.env.PATH ?? ''}` } : process.env
      },
      (error, stdout, stderr) => {
        const err = error as NodeJS.ErrnoException & { code?: string | number; killed?: boolean }
        resolve({
          ok: !error,
          stdout: String(stdout ?? ''),
          stderr: String(stderr ?? (err?.code === 'ENOENT' ? 'No C++ compiler found.' : error?.message ?? '')),
          exitCode: typeof err?.code === 'number' ? err.code : error ? 1 : 0,
          timedOut: Boolean(err?.killed)
        })
      }
    )
    child.stdin?.end(input)
  })
}
