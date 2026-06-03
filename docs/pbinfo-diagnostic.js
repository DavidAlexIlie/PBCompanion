/*
 * PBCompanion pbinfo diagnostic collector
 *
 * Run this in DevTools Console on a pbinfo problem/submission/evaluation page.
 * It stores sanitized snapshots in localStorage so they survive navigation.
 *
 * It DOES NOT export cookies, storage contents, password values, CSRF tokens,
 * or source-code contents. Source editors are represented only by metadata.
 *
 * Commands:
 *   pbCompanionDiagnostic.snapshot('label')
 *   pbCompanionDiagnostic.export()
 *   pbCompanionDiagnostic.clear()
 */
(() => {
  const STORAGE_KEY = 'pbcompanion:diagnostic:v1'
  const MAX_SNAPSHOTS = 30
  const SOURCE_SELECTOR =
    'textarea[name*="sursa" i], textarea[id*="sursa" i], textarea[name*="source" i], ' +
    '.CodeMirror, .CodeMirror-code, .cm-editor, .cm-content, .ace_editor, .ace_content, ' +
    'pre.sursa, .cod-sursa, pre code'
  const SCORE_SELECTOR =
    '.evaluare, #evaluare, .detalii-evaluare, .rezultat, .scor, .punctaj, ' +
    '.badge, .label, .alert, .text-success, table.table, .table-responsive'

  const cleanText = (value, limit = 500) =>
    String(value || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, limit)

  const safeUrl = (value) => {
    try {
      const url = new URL(value, location.href)
      return `${url.origin}${url.pathname}`
    } catch {
      return ''
    }
  }

  const selectorFor = (el) => {
    if (!(el instanceof Element)) return ''
    const parts = []
    let current = el
    for (let depth = 0; current && depth < 5; depth += 1) {
      let part = current.tagName.toLowerCase()
      const id = current.getAttribute('id')
      if (id) {
        part += `#${CSS.escape(id)}`
        parts.unshift(part)
        break
      }
      const classes = Array.from(current.classList).slice(0, 4)
      if (classes.length) part += classes.map((name) => `.${CSS.escape(name)}`).join('')
      if (current.parentElement) {
        const sameTag = Array.from(current.parentElement.children).filter(
          (child) => child.tagName === current.tagName
        )
        if (sameTag.length > 1) part += `:nth-of-type(${sameTag.indexOf(current) + 1})`
      }
      parts.unshift(part)
      current = current.parentElement
    }
    return parts.join(' > ')
  }

  const attributesFor = (el) => {
    const allowed = [
      'id',
      'class',
      'name',
      'type',
      'role',
      'method',
      'action',
      'aria-label',
      'data-language',
      'data-mode'
    ]
    const attributes = {}
    for (const name of allowed) {
      const value = el.getAttribute?.(name)
      if (value == null) continue
      attributes[name] = name === 'action' ? safeUrl(value) : cleanText(value, 200)
    }
    return attributes
  }

  const sourceMetadata = (el) => {
    const textarea = el instanceof HTMLTextAreaElement ? el : el.querySelector?.('textarea')
    const lineSelectors = ['.CodeMirror-line', '.cm-line', '.ace_line']
    const lineCounts = Object.fromEntries(
      lineSelectors.map((selector) => [selector, el.querySelectorAll?.(selector).length || 0])
    )
    return {
      selector: selectorFor(el),
      attributes: attributesFor(el),
      valueLength: textarea?.value?.length || 0,
      textLength: el.textContent?.length || 0,
      childCount: el.childElementCount || 0,
      lineCounts
    }
  }

  const sanitizedElementText = (el) => {
    const clone = el.cloneNode(true)
    clone
      .querySelectorAll(`${SOURCE_SELECTOR}, input, textarea, select, script, style`)
      .forEach((node) => node.remove())
    return cleanText(clone.textContent)
  }

  const scoreCandidates = () => {
    const seen = new Set()
    const candidates = []
    const nodes = Array.from(document.querySelectorAll(SCORE_SELECTOR))
    for (const el of nodes) {
      const text = sanitizedElementText(el)
      if (!/(?:punct|scor|evalu|verdict|accept|corect|greș|gres)/i.test(text)) continue
      const key = `${selectorFor(el)}:${text}`
      if (seen.has(key)) continue
      seen.add(key)
      candidates.push({
        selector: selectorFor(el),
        attributes: attributesFor(el),
        text
      })
      if (candidates.length >= 40) break
    }
    return candidates
  }

  const forms = () =>
    Array.from(document.forms).map((form) => ({
      selector: selectorFor(form),
      attributes: attributesFor(form),
      controls: Array.from(form.elements)
        .filter((el) => el instanceof HTMLElement)
        .map((el) => ({
          selector: selectorFor(el),
          attributes: attributesFor(el),
          label: /submit|button/i.test(el.getAttribute('type') || el.tagName)
            ? cleanText(el.textContent || el.getAttribute('value'), 100)
            : '[redacted]'
        }))
    }))

  const buttons = () =>
    Array.from(document.querySelectorAll('button, input[type="submit"], a'))
      .map((el) => ({
        selector: selectorFor(el),
        attributes: attributesFor(el),
        label: cleanText(el.textContent || el.getAttribute('value'), 120)
      }))
      .filter((item) => /trimite|trimitere|submit|evalu|solu|surs/i.test(item.label))

  const load = () => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
    } catch {
      return []
    }
  }

  const save = (snapshots) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshots.slice(-MAX_SNAPSHOTS)))
  }

  const snapshot = (label = 'manual') => {
    const item = {
      version: 1,
      label,
      capturedAt: new Date().toISOString(),
      page: {
        url: safeUrl(location.href),
        title: document.title,
        readyState: document.readyState
      },
      sourceCandidates: Array.from(document.querySelectorAll(SOURCE_SELECTOR)).map(sourceMetadata),
      scoreCandidates: scoreCandidates(),
      forms: forms(),
      submissionButtons: buttons()
    }
    const snapshots = load()
    snapshots.push(item)
    save(snapshots)
    console.info('[PBCompanion diagnostic] snapshot saved:', label, item)
    return item
  }

  const exportReport = () => {
    snapshot('export')
    const report = {
      notice:
        'Sanitized PBCompanion diagnostic. No cookies, tokens, passwords, form values, or source-code contents are included.',
      userAgent: navigator.userAgent,
      snapshots: load()
    }
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' })
    const anchor = document.createElement('a')
    anchor.href = URL.createObjectURL(blob)
    anchor.download = `pbcompanion-diagnostic-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
    anchor.click()
    setTimeout(() => URL.revokeObjectURL(anchor.href), 1000)
  }

  const clear = () => {
    localStorage.removeItem(STORAGE_KEY)
    console.info('[PBCompanion diagnostic] stored snapshots cleared')
  }

  document.addEventListener(
    'submit',
    (event) => snapshot(`submit:${selectorFor(event.target)}`),
    true
  )
  document.addEventListener(
    'click',
    (event) => {
      const el = event.target?.closest?.('button, input[type="submit"], a')
      const label = cleanText(el?.textContent || el?.getAttribute?.('value'), 120)
      if (el && /trimite|trimitere|submit|evalu|solu|surs/i.test(label)) {
        snapshot(`click:${label}`)
      }
    },
    true
  )

  window.pbCompanionDiagnostic = { snapshot, export: exportReport, clear }
  snapshot('installed')
  console.info(
    '[PBCompanion diagnostic] installed. After reproducing the flow, run pbCompanionDiagnostic.export()'
  )
})()
