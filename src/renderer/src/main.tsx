import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import NotesPanel from './components/NotesPanel'
import WhiteboardPanel from './components/WhiteboardPanel'
import { applyTheme, cachedTheme } from './lib/theme'
import './index.css'

// Paint the right theme on the first frame; settings confirm it right after.
applyTheme(cachedTheme())

// Pop-out windows load the same bundle with a hash route:
//   #/panel/notes/<id>  or  #/panel/whiteboard/<id>
function pickRoot(): JSX.Element {
  const m = window.location.hash.match(/^#\/panel\/(notes|whiteboard)\/(\d+)/)
  if (m) {
    const id = Number(m[2])
    return m[1] === 'notes' ? <NotesPanel problemId={id} /> : <WhiteboardPanel problemId={id} />
  }
  return <App />
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>{pickRoot()}</React.StrictMode>
)
