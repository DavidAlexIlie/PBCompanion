[Romana](README.md) | **English**

# PBCompanion

A Windows desktop companion for [pbinfo.ro](https://www.pbinfo.ro). It embeds
the real pbinfo site in a browser view and adds a local organization layer on
top: a drag-and-drop progress board, a problem library, groups, per-problem
notes and whiteboards, and attempt history.

pbinfo remains the single source of truth for grading. PBCompanion reads only
your own data from the page you are viewing. It does not scrape hidden tests,
automate submissions, or compute scores.

## Table of contents

- [Overview](#overview)
- [Browsing and registering problems](#browsing-and-registering-problems)
- [Progress board](#progress-board)
- [Solving and score detection](#solving-and-score-detection)
- [Notes and whiteboard](#notes-and-whiteboard)
- [Groups](#groups)
- [Requirements](#requirements)
- [Development](#development)
- [Data and storage](#data-and-storage)
- [Architecture](#architecture)
- [License](#license)

## Overview

Everything lives locally: SQLite for metadata plus real folders on disk for
groups. The pbinfo site is loaded live in an embedded browser, so you log in
once and solve problems exactly as you would in a normal browser, while
PBCompanion organizes the results around it.

## Browsing and registering problems

Browse pbinfo inside the app. When you open a problem the app has not seen yet,
a NEW action appears; clicking it registers the problem and drops a token on the
progress board.

![Progress board and registering a new problem](docs/ProgressBoard%2BPbinfoNewProblem.gif)

## Progress board

Three lanes: In Progress, Completed, and DNF. Drag tokens between and within
lanes; manual placement always wins over auto-detection. Lanes are resizable,
and right-clicking a token lets you mark it (yellow outline) or delete it.

## Solving and score detection

Submit on pbinfo as usual. The content script reads the verdict and records the
score, timestamp, and source code when available. A full score moves the problem
to Completed automatically, unless you have already placed it yourself.

![Solving a problem and reaching 100 points](docs/SolveProblem100.gif)

## Notes and whiteboard

Each problem has notes and a whiteboard, opened from its detail window. They open
as independent, frameless windows (notes on the left, whiteboard on the right)
that can be dragged anywhere, including another monitor. The whiteboard uses a
high-resolution canvas with smoothed, continuous strokes, an eraser, and undo
(Ctrl+Z). Both autosave every second and close with the problem.

![Notes and whiteboard windows](docs/Notes%26Whiteboard.gif)

## Groups

Organize problems into groups, each with a color and icon and mirrored as a real
folder on disk. Drag problems from the library into a group; right-click a group
to edit it.

![Creating and editing groups](docs/Groups.gif)

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
  session persistence, ad blocking, pop-out panels, and all IPC handlers.
- Preload (`src/preload`): `index.ts` exposes a typed `window.api` to the
  renderer; `inject.ts` is the content script running inside pbinfo; all pbinfo
  DOM selectors live in `pbinfoSelectors.ts`.
- Renderer (`src/renderer`): React, TypeScript, Tailwind CSS, dnd-kit, Zustand.

pbinfo markup is treated as unstable. Every selector has fallbacks and every
extraction degrades gracefully instead of crashing. When pbinfo changes its
HTML, `src/preload/pbinfoSelectors.ts` is the only file that should need
updating.

## License

MIT
