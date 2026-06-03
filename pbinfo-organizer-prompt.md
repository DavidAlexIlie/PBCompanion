# Build me a desktop app: "pbInfo Organizer" (Windows)

You are building a Windows desktop application that wraps the real pbinfo.ro website inside an embedded webview and adds a personal organization layer on top of it. The app does NOT scrape, emulate, or reverse-engineer pbinfo's grading. pbinfo remains the single source of truth. My app is a launcher + organizer + progress tracker built around the real site.

Read this entire spec before writing code. Then propose the project structure, confirm the stack, and start building incrementally. Do not over-engineer. Build it in working vertical slices I can run after each milestone.

---

## 0. Hard constraints and philosophy

- **Target platform: Windows desktop.** Use WebView2 (it's already on Windows 10/11).
- **pbinfo is loaded live in an embedded webview.** I log in there exactly as I would in a normal browser. I write code, submit, and get graded on THEIR site, inside my app.
- **My app reads only my own data** (my scores, my submissions, the problems I'm looking at). No mass scraping of hidden tests, no automated mass submissions, no bot behavior. This is a personal overlay, not a crawler. Respect this boundary in every feature.
- **Session must persist.** I log in once; the webview keeps me logged in across app restarts (persistent WebView2 user-data folder / persistent cookies). I should NOT have to re-enter my password every launch. (The user originally imagined re-login each time via Google's saved password, but persistent session is cleaner and is what we want.)
- **Local-first storage.** Everything I organize lives on my machine: SQLite for metadata, real folders on disk for groups. The app must work offline for everything except actually talking to pbinfo.
- Build incrementally. After each milestone the app must launch and do something real.

### Stack decision

You choose between **Tauri (Rust + web frontend)** and **Electron (Node + web frontend)**, and justify the choice in one short paragraph before starting. Guidance:
- Tauri → smaller binary, native WebView2, good filesystem/SQLite story, but Rust + webview-injection IPC is more fiddly.
- Electron → `<webview>`/`BrowserView` is very controllable, script injection and IPC are easy, faster to ship, larger binary.
Given that this app leans heavily on **injecting scripts into the pbinfo webview and piping data back via IPC**, and that DOM-injection + IPC is the riskiest part, pick whichever makes that part most reliable. If you pick Electron, use `BrowserView`/`WebContentsView` (not the deprecated `<webview>` tag where avoidable) with a strict preload script. If Tauri, use the webview window + injected init script + the Tauri IPC bridge.

Frontend in both cases: **React + TypeScript + Tailwind CSS**. Drag & drop: **dnd-kit** (`@dnd-kit/core`, `@dnd-kit/sortable`). State: lightweight (Zustand or React context — your call, keep it simple). SQLite via whatever is idiomatic for the chosen stack (better-sqlite3 for Electron; tauri-plugin-sql or rusqlite for Tauri).

---

## 1. The big picture / layout

The window has two coexisting realities:

1. **My UI** (the organizer): home dashboard, the three progress tabs, the problem detail window, the Groups tab, settings.
2. **The pbinfo webview**: the real site, where I'm logged in and actually solve problems.

Clicking any problem element in my UI navigates the webview to that problem's real URL (e.g. `https://www.pbinfo.ro/probleme/2681/inversmax`). The webview is where I read the official statement, write code, and submit. My UI is the map and the scoreboard around it.

Decide on a clean way to show both: e.g. a collapsible split view — my organizer on one side / panel, the pbinfo webview on the other — plus the ability to pop the webview to full width when I'm actively solving. Make the transition smooth, not jarring.

---

## 2. Auto-detect "NEW" problems while browsing

Core interaction the user described:

- I browse pbinfo **inside the app's webview**. I scroll, I land on a problem page, say problem 123 named "...".
- The app detects I'm viewing a problem page it hasn't registered yet, and surfaces a **"NEW" button** somewhere visible (e.g. a floating badge or a slot in my UI).
- Clicking NEW registers that problem into my system: it parses the problem ID, slug, title (and statement if easy) from the page via the injected script, and creates a problem element that lands in the **In Progress** tab by default.

Implementation notes:
- An **injected content script** runs on every pbinfo page load inside the webview. It detects problem pages by URL pattern (`/probleme/<id>/<slug>`), extracts `{ id, slug, title, statementHtml }` from the DOM, and sends it to the app over IPC.
- The app keeps a registry of known problem IDs. If the current page's problem ID is unknown → show NEW. If known → maybe show its current status/score instead.
- Be defensive about pbinfo's DOM: selectors may change, pages vary. Centralize all pbinfo DOM selectors in ONE module (`pbinfoSelectors.ts` or similar) so they're trivial to fix when the site changes. Fail gracefully (never crash the app because a selector returned null).

---

## 3. The three progress tabs (the heart of the app)

Three sections: **In Progress**, **Completed**, **DNF (Did Not Finish)**.

Each problem is represented by a **draggable semicircle element** ("token") with the problem number prominently displayed inside it (the number is the visual hero). On hover/secondary text show the problem name.

Behavior:
- Tokens can be **dragged and dropped anywhere** between and within the three sections. Use dnd-kit. Dropping a token into a section sets that problem's status to that section. Persist position/order.
- **Auto-classification suggestion, but manual override always wins.** When the app detects I scored 100 points on a problem (via the injected script reading the verdict, or by reading my own results page), it can auto-move it to Completed. BUT — and this is explicit from the user — even if I only scored 10 points, I can still drag it into Completed myself, and the app must respect that. Manual placement is never overridden by auto-detection once I've set it. (Track both: `detected_score` and `user_status`; user_status, if set, wins.)
- Layout inside each section: a free-ish board / grid where tokens live. Reordering and cross-section moves both work.

Make the semicircle token genuinely nice: number large and centered, a thin score ring or a small score tag attached, color-coded by score band (see design section). It should feel tactile when dragged.

---

## 4. Score detection (read my own data only)

Two complementary mechanisms, both reading only MY data:

1. **DOM verdict listener (primary):** the injected script watches the problem/evaluation page. When a new submission gets evaluated and a score appears (e.g. "100 puncte"), it reads that score from the DOM and reports `{ problemId, score, sourceCode, timestamp }` back over IPC. The app updates the problem's `detected_score` and stores the attempt.
2. **My results/profile page (secondary/backfill):** pbinfo has a page listing my solved problems and scores. The app can fetch/parse *that page* (using the already-authenticated webview session) to backfill scores for problems I registered but whose verdict it didn't catch live. This reads only my own account data.

Never automate submitting. The app only reads what results from submissions I personally make on the site.

---

## 5. The problem detail window

Clicking a semicircle token opens a **new window/panel** for that problem, laid out like this:

- **Top-left:** the problem number.
- **Next to it:** the problem name.
- **Below:** the problem statement (the enunț) — pulled from the injected parse / cached HTML. Render it readably (sanitize the HTML).
- **Below the statement:** the full list of **my attempts** for this problem, each showing: the code I submitted, the score I got, and the timestamp. Show them newest-first.
- Each attempt has a **trash option** to delete that attempt from local memory (this deletes only MY local record of the attempt; it does not and cannot touch pbinfo).
- A button to "Open in pbinfo" that navigates the webview to the live problem page.

Settings interaction: there's a setting **"Keep only best submission"** (see settings). When ON, the app keeps only the highest-scoring attempt per problem and discards the rest locally (with a confirm, since it's destructive).

How attempts get captured: when the injected script reports a submission+verdict (section 4.1), the app stores the submitted source code alongside the score as an attempt for that problem. If reliably capturing the exact submitted source from pbinfo's DOM is not possible, capture what's available (score + timestamp + a link/snapshot) and clearly mark code as "not captured" rather than faking it. Be honest in the data model.

---

## 6. The Groups tab

A separate tab for grouping problems (e.g. "Tema 1", "Recursivitate", etc.).

Layout:
- **Left side:** all registered problems (the full library of tokens).
- **Right side:** the **group creator/editor**:
  - pick a **color** (X),
  - pick an **icon** (Y) from a small icon set,
  - name the group,
  - then **drag and drop** problems from the left into that group.
- A group is BOTH a record in SQLite AND a **real folder on disk** (`groups/Tema 1/...`), so the organization is reflected on the filesystem, not locked inside an opaque DB. A problem can belong to a group; decide whether multi-group membership is allowed (prefer: yes, many-to-many).
- Groups are independent from the In Progress / Completed / DNF status — a problem has a status AND can be in zero or more groups.

---

## 7. Home / landing experience

On launch:
- If the webview session is valid, go straight to the home dashboard (no password prompt).
- If not logged in, show the pbinfo login (real site in the webview). Once I log in once, the persistent session keeps me in.
- Home dashboard summarizes: counts per tab (In Progress / Completed / DNF), recent activity, quick access to groups, and a prominent area to jump into the webview and start browsing problems.

Keep the home calm and uncluttered. It's a launchpad.

---

## 8. Settings

At minimum:
- **Keep only best submission** (toggle) — described in section 5.
- Auto-move to Completed on 100 points (toggle, default on; never overrides manual placement).
- Score band thresholds (for token coloring) — optional, with sensible defaults.
- Clear local cache / reset session (with confirmation).
- Data folder location (where groups/ and the SQLite DB live).

---

## 9. Design language

**Plain white and blue contrast. Simple. Clean.** This is the whole aesthetic — honor it strictly.

- Background: white / very light neutral. Primary accent: a confident blue. Use the blue for active states, the score ring, primary buttons, selected tabs.
- Generous whitespace, clear typography, subtle shadows, rounded corners. No clutter, no gradients-for-the-sake-of-it, no dark theme unless trivially free.
- The semicircle token: white or light fill, blue number, a score indicator. Score band coloring suggestion (tweakable in settings):
  - 0 or untried → neutral grey,
  - 1–99 → amber/orange ring (partial),
  - 100 → solid blue / success.
- Drag interactions should feel smooth: lift shadow, slight scale, snap into place.
- Three tabs and the groups view should read instantly. Iconography minimal and consistent.

Before building UI, read and follow the frontend-design skill conventions if available in your environment. Aim for something that looks intentional and crafted, not a default-bootstrap look.

---

## 10. Data model (starting point — refine as needed)

```sql
CREATE TABLE problems (
  id            INTEGER PRIMARY KEY,   -- pbinfo problem id, e.g. 2681
  slug          TEXT,                  -- e.g. inversmax
  title         TEXT,
  url           TEXT,
  statement_html TEXT,                 -- cached enunț
  detected_score INTEGER,              -- best score the app detected from pbinfo
  user_status   TEXT,                  -- 'in_progress' | 'completed' | 'dnf' (manual wins)
  board_x       REAL,                  -- position within its section board
  board_y       REAL,
  sort_index    INTEGER,
  created_at    TEXT,
  updated_at    TEXT
);

CREATE TABLE attempts (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  problem_id    INTEGER REFERENCES problems(id) ON DELETE CASCADE,
  source_code   TEXT,                  -- captured submitted code (nullable if not capturable)
  score         INTEGER,
  submitted_at  TEXT
);

CREATE TABLE groups (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  color         TEXT,
  icon          TEXT,
  folder_path   TEXT,                  -- real folder on disk
  sort_index    INTEGER,
  created_at    TEXT
);

CREATE TABLE group_problems (
  group_id      INTEGER REFERENCES groups(id) ON DELETE CASCADE,
  problem_id    INTEGER REFERENCES problems(id) ON DELETE CASCADE,
  sort_index    INTEGER,
  PRIMARY KEY (group_id, problem_id)
);

CREATE TABLE settings (
  key           TEXT PRIMARY KEY,
  value         TEXT
);
```

Distinguish clearly between `detected_score` (what pbinfo says) and `user_status` (where I dragged it). Status displayed = `user_status` if the user has ever manually placed it, otherwise derived from `detected_score`.

---

## 11. Architecture of the webview ↔ app bridge

This is the critical, fragile part — design it carefully and isolate it:

- **Injected script** (content/init script) running inside the pbinfo webview:
  - detects problem pages and extracts `{id, slug, title, statementHtml}`,
  - watches for submission verdicts and extracts `{problemId, score, sourceCode?, timestamp}`,
  - sends messages to the app via the IPC bridge (Electron preload `contextBridge` + `ipcRenderer`, or Tauri's injected JS → `window.__TAURI__`/event emit).
- **App side** receives these messages, updates SQLite, updates the React UI reactively.
- **All pbinfo selectors live in one file.** Treat pbinfo's DOM as unstable. Every extraction wrapped in try/catch, every selector with a fallback, every failure logged but non-fatal.
- The app **commands** the webview to navigate (to a problem URL) via the same bridge.

Document this bridge well in the README, because it's what I'll be debugging when pbinfo changes its markup.

---

## 12. Build order (milestones — make each runnable)

1. **Skeleton:** app launches, embedded WebView2 loads pbinfo.ro with persistent session, basic two-pane layout, SQLite initialized.
2. **Injection bridge:** injected script detects problem pages and pipes `{id, slug, title}` to the app; prove it by logging detected problems in a side panel.
3. **NEW + registration:** the NEW button registers a problem into SQLite; it appears as a semicircle token in **In Progress**.
4. **Three tabs + dnd-kit:** tokens drag between In Progress / Completed / DNF; positions persist.
5. **Score detection:** injected script reads verdicts; auto-move to Completed on 100 (respecting manual override); store attempts.
6. **Problem detail window:** statement + attempts list + per-attempt trash + "open in pbinfo".
7. **Groups tab:** group creator (color/icon/name), left library, drag into groups, folder-on-disk creation, many-to-many membership.
8. **Settings:** keep-only-best, auto-move toggle, thresholds, reset/cache.
9. **Polish:** the white/blue design pass, token animations, home dashboard, empty states, error states for broken selectors.

At the end, write a clear **README** covering: how to run/build for Windows, where data is stored, how the webview bridge works, and exactly which pbinfo selectors are used (so they can be fixed when the site changes).

---

## 13. Boundaries to keep (state these in the README too)

- Reads only my own pbinfo data; no scraping of hidden test data; no automated/mass submissions.
- pbinfo is the source of truth for grading; the app never fakes or computes scores.
- Trash/delete affects only local records, never pbinfo.
- The app should degrade gracefully if pbinfo is unreachable or changes its HTML.

---

Start by confirming the stack choice (one paragraph), then scaffold milestone 1 and show me a runnable app. Ask me only if something is genuinely blocking; otherwise make reasonable decisions and keep moving. Prefer terse, targeted code; minimal comments unless a section is non-obvious (the webview bridge deserves comments).
