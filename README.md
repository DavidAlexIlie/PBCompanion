**Romana** | [English](README.en.md)

# PBCompanion

Un companion desktop pentru Windows pentru [pbinfo.ro](https://www.pbinfo.ro).
Incarca site-ul real pbinfo intr-un browser integrat si adauga deasupra un strat
local de organizare: o tabla de progres cu drag-and-drop, o biblioteca de
probleme, grupuri, notite si tabla de desen per problema, si istoricul
incercarilor.

pbinfo ramane singura sursa de adevar pentru notare. PBCompanion citeste doar
datele tale, de pe pagina pe care o vizualizezi. Nu extrage teste ascunse, nu
automatizeaza trimiteri si nu calculeaza scoruri.

## Cuprins

- [Prezentare generala](#prezentare-generala)
- [Navigare si inregistrarea problemelor](#navigare-si-inregistrarea-problemelor)
- [Tabla de progres](#tabla-de-progres)
- [Rezolvare si detectarea scorului](#rezolvare-si-detectarea-scorului)
- [Notite si tabla de desen](#notite-si-tabla-de-desen)
- [Grupuri](#grupuri)
- [Cerinte](#cerinte)
- [Dezvoltare](#dezvoltare)
- [Date si stocare](#date-si-stocare)
- [Arhitectura](#arhitectura)
- [Licenta](#licenta)

## Prezentare generala

Totul este stocat local: SQLite pentru metadate plus foldere reale pe disc
pentru grupuri. Site-ul pbinfo este incarcat live intr-un browser integrat,
asa ca te autentifici o singura data si rezolvi problemele exact ca intr-un
browser obisnuit, in timp ce PBCompanion organizeaza rezultatele in jur.

## Navigare si inregistrarea problemelor

Navighezi pe pbinfo in interiorul aplicatiei. Cand deschizi o problema pe care
aplicatia nu a vazut-o inca, apare actiunea NEW; un click o inregistreaza si
aseaza un token pe tabla de progres.

![Tabla de progres si inregistrarea unei probleme noi](docs/ProgressBoard%2BPbinfoNewProblem.gif)

## Tabla de progres

Trei coloane: In Progress, Completed si DNF. Trage tokenii intre si in interiorul
coloanelor; plasarea manuala are mereu prioritate fata de detectarea automata.
Coloanele sunt redimensionabile, iar click-dreapta pe un token iti permite sa-l
marchezi (contur galben) sau sa-l stergi.

## Rezolvare si detectarea scorului

Trimiti solutia pe pbinfo ca de obicei. Scriptul integrat citeste verdictul si
inregistreaza scorul, momentul si codul sursa cand este disponibil. Un scor
maxim muta automat problema in Completed, daca nu ai plasat-o deja tu.

![Rezolvarea unei probleme si atingerea a 100 de puncte](docs/SolveProblem100.gif)

## Notite si tabla de desen

Fiecare problema are notite si o tabla de desen, deschise din fereastra sa de
detalii. Se deschid ca ferestre independente, fara chenar (notitele in stanga,
tabla de desen in dreapta), care pot fi trase oriunde, inclusiv pe alt monitor.
Tabla de desen foloseste un canvas de rezolutie inalta cu trasaturi netede si
continue, o radiera si undo (Ctrl+Z). Ambele se salveaza automat in fiecare
secunda si se inchid odata cu problema.

![Ferestrele de notite si tabla de desen](docs/Notes%26Whiteboard.gif)

## Grupuri

Organizezi problemele in grupuri, fiecare cu o culoare si o pictograma, oglindite
ca foldere reale pe disc. Trage problemele din biblioteca intr-un grup;
click-dreapta pe un grup pentru a-l edita.

![Crearea si editarea grupurilor](docs/Groups.gif)

## Cerinte

- Windows 10 sau 11 (WebView2 este inclus).
- Node.js 18+ si, pentru modulul nativ SQLite, Python si Visual Studio
  C++ Build Tools.

## Dezvoltare

```
npm install      # instaleaza dependintele si recompileaza better-sqlite3 pentru Electron
npm run dev       # ruleaza cu hot reload
npm run build     # impacheteaza main, preload si renderer in out/
npm start         # ruleaza build-ul impachetat
npm run dist      # creeaza un installer Windows in release/
```

## Date si stocare

- Baza de date: `<dataDir>/pbinfo-organizer.db`
- Foldere grupuri: `<dataDir>/groups/<nume>/`
- Backup sesiune: `<dataDir>/pbinfo-session.bin` (criptat)
- `dataDir` implicit: `%APPDATA%/pbcompanion/pbinfo-data` (se poate schimba in Setari)

Stergerea incercarilor, problemelor sau grupurilor afecteaza doar inregistrarile
locale si nu atinge niciodata pbinfo.

## Arhitectura

Trei procese comunica prin IPC Electron:

- Main (`src/main`): gestionarea ferestrei si a `WebContentsView`, SQLite, setari,
  persistenta sesiunii, blocarea reclamelor, ferestrele pop-out si toate
  handler-ele IPC.
- Preload (`src/preload`): `index.ts` expune un `window.api` tipizat catre
  renderer; `inject.ts` este scriptul integrat care ruleaza in pbinfo; toti
  selectorii DOM pentru pbinfo se afla in `pbinfoSelectors.ts`.
- Renderer (`src/renderer`): React, TypeScript, Tailwind CSS, dnd-kit, Zustand.

Marcajul pbinfo este tratat ca instabil. Fiecare selector are variante de
rezerva si fiecare extragere esueaza elegant in loc sa crape aplicatia. Cand
pbinfo isi schimba HTML-ul, `src/preload/pbinfoSelectors.ts` este singurul
fisier care ar trebui modificat.

## Licenta

MIT
