# PBInfo diagnostic collection

This diagnostic helps PBCompanion learn the real pbinfo DOM for:

- source-code editors;
- submission buttons and forms;
- evaluation-in-progress pages;
- final score pages;
- historical attempts shown while merely browsing.

It does **not** export cookies, local-storage contents, passwords, CSRF tokens,
form values, or source-code contents. Source editors are represented only by
their selector, size, and line-count metadata.

## Before starting

Use a small test problem and source code you do not mind submitting. Keep the
browser DevTools Console open during the flow. Chrome/Edge may require you to
type `allow pasting` before pasting code into DevTools.

## Collect the important flows

1. Open a problem that was already solved before PBCompanion observed it.
2. Open DevTools with `F12`, select **Console**, paste the complete contents of
   `docs/pbinfo-diagnostic.js`, and press Enter.
3. Run:

   ```js
   pbCompanionDiagnostic.snapshot('historical-solved-problem')
   ```

4. Open a problem with a submission editor. Paste and run the diagnostic script
   again, then run:

   ```js
   pbCompanionDiagnostic.snapshot('editor-before-submit')
   ```

5. Submit the solution normally. The diagnostic automatically records matching
   button clicks and native form submissions.
6. On every page reached during evaluation, paste and run the diagnostic script
   again. Then save a clearly named snapshot:

   ```js
   pbCompanionDiagnostic.snapshot('evaluation-pending')
   ```

7. When the final score appears, paste and run the diagnostic script again:

   ```js
   pbCompanionDiagnostic.snapshot('evaluation-final')
   ```

8. Download the sanitized report:

   ```js
   pbCompanionDiagnostic.export()
   ```

9. Send the downloaded `pbcompanion-diagnostic-*.json` file.

## Useful extra cases

Repeat the flow for these cases when possible:

- a `100` score;
- a partial score such as `10`;
- a compilation error or zero score;
- a problem whose historical attempts list includes code;
- a submission that stays queued for several seconds.

After exporting, remove stored diagnostic snapshots:

```js
pbCompanionDiagnostic.clear()
```
