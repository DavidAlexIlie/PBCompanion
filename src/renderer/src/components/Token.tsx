import { forwardRef } from 'react'
import type { Problem, AppSettings } from '../../../shared/types'
import { cleanProblemName } from '../../../shared/text'
import { scoreBand, bandRing, bandText, bandTag, type Band } from '../lib/score'

interface Props {
  problem: Problem
  settings: AppSettings
  onClick?: () => void
  onContextMenu?: (e: React.MouseEvent) => void
  dragging?: boolean
  compact?: boolean
  // fluid = fill the container cell and scale typography to its width
  // (so lanes can stay narrow and still show ≥2 tokens per row).
  fluid?: boolean
  // dnd-kit passthrough (DraggableAttributes / listener maps — kept loose on purpose)
  style?: React.CSSProperties
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  attributes?: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  listeners?: any
}

const labelForBand: Record<Band, (p: Problem) => string> = {
  none: (p) => (p.detected_score === null ? '—' : `${p.detected_score}`),
  partial: (p) => `${p.detected_score}`,
  complete: () => '100'
}

/**
 * The draggable semicircle "token". The problem NUMBER is the visual hero;
 * the name shows on hover; a score tag + colored ring encode the score band.
 */
const Token = forwardRef<HTMLDivElement, Props>(function Token(
  { problem, settings, onClick, onContextMenu, dragging, compact, fluid, style, attributes, listeners },
  ref
) {
  const band = scoreBand(problem.detected_score, settings)
  const name = cleanProblemName(problem.title, problem.id, problem.slug)
  const marked = problem.marked === 1
  // A marked problem gets a bold yellow outline that overrides the score color.
  const ringClass = marked ? 'ring-yellow-400' : bandRing[band]

  // Fluid tokens fill their grid cell and scale font with container width (cqw).
  const fluidWrap: React.CSSProperties = fluid
    ? { containerType: 'inline-size', width: '100%' }
    : {}
  const domeStyle: React.CSSProperties = fluid
    ? { aspectRatio: '7 / 5', width: '100%', maxWidth: '7rem', margin: '0 auto' }
    : {}
  const numberStyle: React.CSSProperties = fluid
    ? { fontSize: 'clamp(0.78rem, 34cqw, 1.6rem)', lineHeight: 1 }
    : {}
  const tagStyle: React.CSSProperties = fluid
    ? { fontSize: 'clamp(0.42rem, 13cqw, 0.62rem)', lineHeight: 1 }
    : {}

  const fixedSize = compact ? 'w-[88px] h-[66px]' : 'w-[104px] h-[78px]'

  return (
    <div
      ref={ref}
      style={{ ...fluidWrap, ...style }}
      className="group/token relative select-none"
      onContextMenu={onContextMenu}
      {...attributes}
    >
      <div
        {...listeners}
        onClick={onClick}
        title={name}
        style={domeStyle}
        className={`flex ${fluid ? '' : fixedSize} cursor-grab flex-col items-center justify-center rounded-t-full rounded-b-2xl border border-slate-200 bg-white shadow-soft transition-all duration-150 active:cursor-grabbing ${
          marked ? 'ring-4' : 'ring-2'
        } ${ringClass} ${dragging ? 'scale-105 shadow-lift' : 'hover:-translate-y-0.5 hover:shadow-lift'}`}
      >
        <span
          style={numberStyle}
          className={`font-extrabold leading-none text-brand-700 ${fluid ? '' : 'text-2xl'} ${bandText[band]}`}
        >
          {problem.id}
        </span>
        <span
          style={tagStyle}
          className={`mt-1 rounded-full px-1.5 py-0.5 font-bold leading-none ${fluid ? '' : 'text-[10px]'} ${bandTag[band]}`}
        >
          {labelForBand[band](problem)}
        </span>
      </div>
      <div className="pointer-events-none absolute left-1/2 top-full z-10 mt-1 w-max max-w-[160px] -translate-x-1/2 truncate rounded-md bg-slate-900 px-2 py-1 text-[11px] text-white opacity-0 shadow-lg transition-opacity group-hover/token:opacity-100">
        {name}
      </div>
    </div>
  )
})

export default Token
