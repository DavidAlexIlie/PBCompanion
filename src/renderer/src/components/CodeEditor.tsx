/**
 * CodeEditor.tsx — the C++ editor used by the workspace.
 *
 * CodeMirror 6 with the behaviour you expect from a real IDE: typing `{`, `(`
 * or `"` closes the pair, Enter keeps (and grows) the indentation, Tab inserts
 * a real tab stop instead of moving focus, `}` snaps back a level, there is
 * keyword/snippet autocomplete, and Alt+Shift+F reformats the file.
 *
 * Colours come from the app palette (CSS variables), so the editor follows the
 * light/dark setting without a second theme system.
 */
import { useEffect, useRef } from 'react'
import { Compartment, EditorState, Prec } from '@codemirror/state'
import {
  EditorView,
  drawSelection,
  dropCursor,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
  rectangularSelection
} from '@codemirror/view'
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
  redo
} from '@codemirror/commands'
import {
  HighlightStyle,
  bracketMatching,
  indentOnInput,
  indentUnit,
  syntaxHighlighting
} from '@codemirror/language'
import {
  acceptCompletion,
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completeAnyWord,
  completionKeymap,
  snippetCompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult
} from '@codemirror/autocomplete'
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search'
import { cpp } from '@codemirror/lang-cpp'
import { tags as t } from '@lezer/highlight'
import { formatCpp } from '../../../shared/cppFormat'
import type { ThemeName } from '../../../shared/types'

const INDENT = '    '

const syntax = HighlightStyle.define([
  { tag: [t.keyword, t.definitionKeyword, t.modifier, t.self, t.null, t.bool], color: 'var(--syn-keyword)' },
  { tag: [t.controlKeyword, t.operatorKeyword], color: 'var(--syn-control)' },
  { tag: [t.typeName, t.standard(t.typeName), t.namespace], color: 'var(--syn-type)' },
  { tag: [t.string, t.special(t.string), t.character, t.escape], color: 'var(--syn-string)' },
  { tag: [t.number, t.literal], color: 'var(--syn-number)' },
  { tag: [t.lineComment, t.blockComment], color: 'var(--syn-comment)', fontStyle: 'italic' },
  {
    tag: [t.function(t.variableName), t.function(t.propertyName), t.function(t.definition(t.variableName))],
    color: 'var(--syn-function)'
  },
  { tag: [t.variableName, t.propertyName, t.labelName], color: 'var(--syn-variable)' },
  { tag: [t.processingInstruction, t.meta], color: 'var(--syn-preproc)' },
  {
    tag: [t.operator, t.arithmeticOperator, t.logicOperator, t.compareOperator, t.bitwiseOperator, t.derefOperator, t.updateOperator, t.definitionOperator, t.separator, t.paren, t.brace, t.squareBracket, t.angleBracket],
    color: 'var(--syn-operator)'
  }
])

const editorTheme = EditorView.theme({
  '&': {
    height: '100%',
    fontSize: '13.5px',
    backgroundColor: 'rgb(var(--c-white))',
    color: 'rgb(var(--c-slate-800))'
  },
  '.cm-scroller': {
    fontFamily: "'Cascadia Code', Consolas, ui-monospace, monospace",
    lineHeight: '1.55'
  },
  '.cm-content': { padding: '10px 0', caretColor: 'rgb(var(--c-brand-600))' },
  '.cm-gutters': {
    backgroundColor: 'rgb(var(--c-white))',
    color: 'rgb(var(--c-slate-400))',
    borderRight: '1px solid rgb(var(--c-slate-200))'
  },
  '.cm-activeLineGutter': {
    backgroundColor: 'rgb(var(--c-brand-50))',
    color: 'rgb(var(--c-slate-600))'
  },
  '.cm-activeLine': { backgroundColor: 'rgb(var(--c-brand-50) / 0.55)' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'rgb(var(--c-brand-600))', borderLeftWidth: '2px' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': {
    backgroundColor: 'rgb(var(--c-brand-200))'
  },
  '.cm-selectionMatch': { backgroundColor: 'rgb(var(--c-amber-100))' },
  '.cm-matchingBracket, &.cm-focused .cm-matchingBracket': {
    backgroundColor: 'rgb(var(--c-brand-100))',
    outline: '1px solid rgb(var(--c-brand-400))'
  },
  '.cm-nonmatchingBracket': { color: 'rgb(var(--c-rose-600))' },
  '.cm-tooltip': {
    border: '1px solid rgb(var(--c-slate-200))',
    backgroundColor: 'rgb(var(--c-white))',
    color: 'rgb(var(--c-slate-800))',
    borderRadius: '8px',
    overflow: 'hidden',
    boxShadow: '0 8px 24px rgb(var(--c-shadow) / 0.18)'
  },
  '.cm-tooltip-autocomplete ul li[aria-selected]': {
    backgroundColor: 'rgb(var(--c-brand-600))',
    color: 'rgb(var(--c-white))'
  },
  '.cm-completionIcon': { color: 'rgb(var(--c-slate-400))' },
  '.cm-completionDetail': { color: 'rgb(var(--c-slate-400))', fontStyle: 'normal' },
  '&.cm-editor.cm-focused': { outline: 'none' }
})

// A `dark: true` theme makes CodeMirror pick dark-friendly defaults for the
// bits we don't style ourselves (e.g. selection blending, panels).
const darkFlag = EditorView.theme({}, { dark: true })

const KEYWORDS = [
  'alignas', 'auto', 'bool', 'break', 'case', 'catch', 'char', 'class', 'const', 'constexpr',
  'continue', 'default', 'delete', 'do', 'double', 'else', 'enum', 'explicit', 'extern', 'false',
  'float', 'for', 'friend', 'goto', 'if', 'inline', 'int', 'long', 'namespace', 'new', 'nullptr',
  'operator', 'private', 'protected', 'public', 'return', 'short', 'signed', 'sizeof', 'static',
  'struct', 'switch', 'template', 'this', 'throw', 'true', 'try', 'typedef', 'typename', 'union',
  'unsigned', 'using', 'virtual', 'void', 'while',
  'cin', 'cout', 'cerr', 'endl', 'string', 'vector', 'map', 'set', 'pair', 'queue', 'stack',
  'priority_queue', 'sort', 'reverse', 'swap', 'max', 'min', 'abs', 'push_back', 'size', 'begin',
  'end', 'ifstream', 'ofstream', 'printf', 'scanf', 'memset', 'make_pair', 'to_string', 'stoi'
]

const SNIPPETS: Completion[] = [
  snippetCompletion('for (int ${i} = 0; ${i} < ${n}; ${i}++) {\n\t${}\n}', {
    label: 'for',
    detail: 'loop',
    type: 'keyword'
  }),
  snippetCompletion('while (${cond}) {\n\t${}\n}', { label: 'while', detail: 'loop', type: 'keyword' }),
  snippetCompletion('if (${cond}) {\n\t${}\n}', { label: 'if', detail: 'branch', type: 'keyword' }),
  snippetCompletion('if (${cond}) {\n\t${}\n} else {\n\t\n}', {
    label: 'ifelse',
    detail: 'branch',
    type: 'keyword'
  }),
  snippetCompletion('struct ${Name} {\n\t${}\n};', { label: 'struct', type: 'keyword' }),
  snippetCompletion('#include <${iostream}>', { label: '#include', type: 'keyword' }),
  snippetCompletion(
    '#include <iostream>\nusing namespace std;\n\nint main() {\n\t${}\n\treturn 0;\n}',
    { label: 'main', detail: 'program skeleton', type: 'keyword' }
  )
]

const keywordCompletions = KEYWORDS.map((label) => ({ label, type: 'keyword' as const }))

function cppCompletions(context: CompletionContext): CompletionResult | null {
  const word = context.matchBefore(/[#\w]+/)
  if (!word || (word.from === word.to && !context.explicit)) return null
  return { from: word.from, options: [...SNIPPETS, ...keywordCompletions], validFor: /^[#\w]*$/ }
}

/** Alt+Shift+F — reformat the whole file, keeping the cursor on its line. */
function formatDocument(view: EditorView): boolean {
  const current = view.state.doc.toString()
  const formatted = formatCpp(current, { indent: INDENT })
  if (formatted === current) return true

  const line = view.state.doc.lineAt(view.state.selection.main.head).number
  const next = EditorState.create({ doc: formatted }).doc
  const target = next.line(Math.min(line, next.lines))
  view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: formatted },
    selection: { anchor: target.from + (target.text.length - target.text.trimStart().length) },
    scrollIntoView: true
  })
  return true
}

interface Props {
  value: string
  onChange: (value: string) => void
  theme: ThemeName
  className?: string
}

export default function CodeEditor({ value, onChange, theme, className }: Props): JSX.Element {
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  const emit = useRef(onChange)
  const themeCompartment = useRef(new Compartment())
  emit.current = onChange

  useEffect(() => {
    if (!host.current) return
    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightSpecialChars(),
        history(),
        drawSelection(),
        dropCursor(),
        EditorState.allowMultipleSelections.of(true),
        indentOnInput(),
        bracketMatching(),
        closeBrackets(),
        autocompletion({ override: [cppCompletions, completeAnyWord], activateOnTyping: true }),
        rectangularSelection(),
        highlightActiveLine(),
        highlightSelectionMatches(),
        indentUnit.of(INDENT),
        EditorState.tabSize.of(4),
        cpp(),
        syntaxHighlighting(syntax),
        editorTheme,
        themeCompartment.current.of(theme === 'dark' ? darkFlag : []),
        // Tab must indent (or accept a completion) instead of moving focus, so
        // it outranks the default keymaps.
        Prec.highest(
          keymap.of([
            { key: 'Tab', run: acceptCompletion },
            indentWithTab,
            { key: 'Alt-Shift-f', run: formatDocument, preventDefault: true },
            { key: 'Shift-Alt-f', run: formatDocument, preventDefault: true },
            { key: 'Mod-Shift-z', run: redo, preventDefault: true }
          ])
        ),
        keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...searchKeymap, ...historyKeymap, ...completionKeymap]),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) emit.current(u.state.doc.toString())
        })
      ]
    })
    const v = new EditorView({ state, parent: host.current })
    view.current = v
    return () => {
      v.destroy()
      view.current = null
    }
    // Created once; document and theme are pushed in through the effects below.
  }, [])

  // Outside edits (switching problem, loading a draft) replace the document.
  useEffect(() => {
    const v = view.current
    if (!v || v.state.doc.toString() === value) return
    v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value } })
  }, [value])

  useEffect(() => {
    view.current?.dispatch({
      effects: themeCompartment.current.reconfigure(theme === 'dark' ? darkFlag : [])
    })
  }, [theme])

  return <div ref={host} className={className} />
}

export { formatDocument }
