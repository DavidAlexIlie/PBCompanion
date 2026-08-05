import { useEffect, useRef, useState } from 'react'
import PanelChrome from './PanelChrome'
import { useThemeSync } from '../lib/theme'

/**
 * A plain notes panel for a problem. Native textarea undo (Ctrl+Z) covers many
 * changes out of the box. Autosaves every second and flushes on close.
 */
export default function NotesPanel({ problemId }: { problemId: number }): JSX.Element {
  useThemeSync()
  const [text, setText] = useState('')
  const [loaded, setLoaded] = useState(false)
  const dirty = useRef(false)
  const latest = useRef('')

  useEffect(() => {
    window.api.getDoc(problemId).then((d) => {
      setText(d.notes)
      latest.current = d.notes
      setLoaded(true)
    })
  }, [problemId])

  // Autosave loop (1s) + flush on close.
  useEffect(() => {
    const save = (): void => {
      if (!dirty.current) return
      dirty.current = false
      void window.api.saveNotes(problemId, latest.current)
    }
    const t = setInterval(save, 1000)
    const flush = (): void => save()
    window.addEventListener('pagehide', flush)
    window.addEventListener('beforeunload', flush)
    return () => {
      clearInterval(t)
      window.removeEventListener('pagehide', flush)
      window.removeEventListener('beforeunload', flush)
      save()
    }
  }, [problemId])

  return (
    <PanelChrome title={`Notes · #${problemId}`}>
      <textarea
        value={text}
        disabled={!loaded}
        onChange={(e) => {
          setText(e.target.value)
          latest.current = e.target.value
          dirty.current = true
        }}
        placeholder="Write your notes here…"
        spellCheck={false}
        className="h-full w-full resize-none border-0 bg-white p-4 text-sm leading-relaxed text-slate-800 outline-none"
      />
    </PanelChrome>
  )
}
