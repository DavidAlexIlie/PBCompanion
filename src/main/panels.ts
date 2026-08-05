/**
 * panels.ts — the per-problem Notes and Whiteboard windows.
 *
 * Each opens as its own FRAMELESS BrowserWindow (no OS title bar / app header)
 * that behaves like an independent app: it can be dragged anywhere, including
 * another monitor. They load the same renderer bundle but with a hash route
 * (#/panel/<type>/<id>) so the renderer mounts just that panel.
 *
 * Notes open to the LEFT of the main window, the whiteboard to the RIGHT.
 */
import { BrowserWindow, screen } from 'electron'
import { join } from 'path'

type PanelType = 'notes' | 'whiteboard'

const panels = new Map<string, BrowserWindow>()
const key = (type: PanelType, id: number): string => `${type}:${id}`

function loadPanel(win: BrowserWindow, type: PanelType, id: number): void {
  const hash = `/panel/${type}/${id}`
  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}#${hash}`)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'), { hash })
  }
}

export function openPanel(
  parent: BrowserWindow,
  type: PanelType,
  id: number,
  preload: string,
  opts: { backgroundColor: string }
): void {
  const k = key(type, id)
  const existing = panels.get(k)
  if (existing && !existing.isDestroyed()) {
    existing.focus()
    return
  }

  const width = type === 'notes' ? 400 : 600
  const height = 560
  const pb = parent.getBounds()
  const wa = screen.getDisplayMatching(pb).workArea

  let x = type === 'notes' ? pb.x - width - 10 : pb.x + pb.width + 10
  let y = pb.y + 70
  // Keep it on a visible work area.
  x = Math.max(wa.x, Math.min(x, wa.x + wa.width - width))
  y = Math.max(wa.y, Math.min(y, wa.y + wa.height - height))

  const win = new BrowserWindow({
    width,
    height,
    x,
    y,
    minWidth: 280,
    minHeight: 300,
    frame: false,
    resizable: true,
    backgroundColor: opts.backgroundColor,
    title: type === 'notes' ? 'Notes' : 'Whiteboard',
    webPreferences: {
      preload,
      contextIsolation: true,
      sandbox: false
    }
  })
  win.on('closed', () => panels.delete(k))
  loadPanel(win, type, id)
  panels.set(k, win)
}

/** Close both panels for a problem (called when the problem detail closes). */
export function closeProblemPanels(id: number): void {
  for (const type of ['notes', 'whiteboard'] as PanelType[]) {
    const w = panels.get(key(type, id))
    if (w && !w.isDestroyed()) w.close()
  }
}
