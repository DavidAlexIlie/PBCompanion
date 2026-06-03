# PBCompanion

A Windows desktop companion for [pbinfo.ro](https://www.pbinfo.ro). It embeds
the real pbinfo site in a browser view and adds a local organization layer on
top: a drag-and-drop progress board, a problem library, groups, and per-problem
attempt history.

pbinfo remains the single source of truth for grading. PBCompanion reads only
your own data from the page you are viewing. It does not scrape hidden tests,
automate submissions, or compute scores.

## Features

- Embedded pbinfo browser with a persistent login (cookies are mirrored,
  encrypted, to your data folder so the session survives reinstalls).
- A content script registers the problem you are viewing with one click and
  captures submission verdicts (score, timestamp, source when available).
- Progress board with three lanes (In Progress, Completed, DNF). Drag to set
  status; manual placement always wins over auto-detection.
- Right-click a problem to mark it (yellow outline) or delete it locally.
- Groups with a color and icon, each mirrored as a real folder on disk.
- Resizable panels throughout. Built-in ad/tracker blocking in the web view.
- Local-first storage: SQLite plus real folders. No account, no cloud.

## Requirements

- Windows 10 or 11 (WebView2 is included).
- Node.js 18+ and, for the native SQLite module, Python and the Visual Studio
  C++ Build Tools.

## Development

```
npm install      # installs deps and rebuilds better-sqlite3 for Electron
npm run dev       # run with hot reload
npm run build     # bundle main, preload, and renderer into out/
npm start         # run the bundled build
npm run dist      # build a Windows installer into release/
```

## Data and storage

- Database: `<dataDir>/pbinfo-organizer.db`
- Group folders: `<dataDir>/groups/<name>/`
- Session backup: `<dataDir>/pbinfo-session.bin` (encrypted)
- Default `dataDir`: `%APPDATA%/pbcompanion/pbinfo-data` (changeable in Settings)

Deleting attempts, problems, or groups affects local records only and never
touches pbinfo.

## Architecture

Three processes communicate over Electron IPC:

- Main (`src/main`): window and `WebContentsView` management, SQLite, settings,
  session persistence, ad blocking, and all IPC handlers.
- Preload (`src/preload`): `index.ts` exposes a typed `window.api` to the
  renderer; `inject.ts` is the content script running inside pbinfo; all pbinfo
  DOM selectors live in `pbinfoSelectors.ts`.
- Renderer (`src/renderer`): React, TypeScript, Tailwind CSS, dnd-kit, Zustand.

pbinfo markup is treated as unstable. Every selector has fallbacks and every
extraction is wrapped so a missing selector degrades gracefully instead of
crashing. When pbinfo changes its HTML, `src/preload/pbinfoSelectors.ts` is the
only file that should need updating.

## License

MIT
