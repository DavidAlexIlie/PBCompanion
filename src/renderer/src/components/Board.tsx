import { useEffect, useMemo, useRef, useState } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  getFirstCollision,
  closestCorners,
  useSensor,
  useSensors,
  useDroppable,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent
} from '@dnd-kit/core'
import { SortableContext, useSortable, rectSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useStore } from '../store'
import { displayStatus } from '../lib/score'
import Token from './Token'
import Splitter, { usePersistentNumber, clamp } from './Splitter'
import ContextMenu, { type MenuItem } from './ContextMenu'
import ConfirmDialog from './ConfirmDialog'
import { cleanProblemName } from '../../../shared/text'
import { IconProgress, IconCheck, IconDnf } from './icons'
import type { Problem, UserStatus } from '../../../shared/types'

const LANES: {
  status: UserStatus
  title: string
  Icon: (p: { className?: string }) => JSX.Element
  accent: string
}[] = [
  { status: 'in_progress', title: 'In Progress', Icon: IconProgress, accent: 'text-brand-600' },
  { status: 'completed', title: 'Completed', Icon: IconCheck, accent: 'text-emerald-600' },
  { status: 'dnf', title: 'DNF', Icon: IconDnf, accent: 'text-rose-500' }
]

type Lanes = Record<UserStatus, number[]>
const isLaneId = (id: string | number): id is UserStatus =>
  id === 'in_progress' || id === 'completed' || id === 'dnf'

export default function Board(): JSX.Element {
  const { problems, settings, openDetail, refresh } = useStore()
  const [lanes, setLanes] = useState<Lanes>({ in_progress: [], completed: [], dnf: [] })
  const [activeId, setActiveId] = useState<number | null>(null)
  const [fromLane, setFromLane] = useState<UserStatus | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number; problem: Problem } | null>(null)
  const [confirmDel, setConfirmDel] = useState<Problem | null>(null)

  // Resizable lane widths.
  const boardRef = useRef<HTMLDivElement>(null)
  const [w0, setW0] = usePersistentNumber('layout.board.w0', 1)
  const [w1, setW1] = usePersistentNumber('layout.board.w1', 1)
  const [w2, setW2] = usePersistentNumber('layout.board.w2', 1)
  const weights = [w0, w1, w2]
  const setters = [setW0, setW1, setW2]
  const resizeLanes = (i: number, dx: number): void => {
    const cw = boardRef.current?.clientWidth ?? 1
    const total = w0 + w1 + w2
    const d = (dx / cw) * total
    setters[i](clamp(weights[i] + d, total * 0.18, total * 0.7))
    setters[i + 1](clamp(weights[i + 1] - d, total * 0.18, total * 0.7))
  }

  const byId = useMemo(() => {
    const m = new Map<number, Problem>()
    for (const p of problems) m.set(p.id, p)
    return m
  }, [problems])

  // Keep a ref to current lanes for the (stable) collision-detection function.
  const lanesRef = useRef(lanes)
  lanesRef.current = lanes

  useEffect(() => {
    if (activeId !== null || !settings) return
    const next: Lanes = { in_progress: [], completed: [], dnf: [] }
    for (const p of problems) next[displayStatus(p, settings)].push(p.id)
    setLanes(next)
  }, [problems, settings, activeId])

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  /**
   * Pointer-first collision detection. Only droppables UNDER the cursor are
   * considered, so dragging near the top of a lane can never jump to a
   * neighbouring lane. When over a lane body we resolve to the nearest token in
   * THAT lane for a correct insertion point.
   */
  const collisionDetection: CollisionDetection = (args) => {
    const pointer = pointerWithin(args)
    const hits = pointer.length > 0 ? pointer : rectIntersection(args)
    let overId = getFirstCollision(hits, 'id')
    if (overId == null) return []
    if (isLaneId(overId)) {
      const items = lanesRef.current[overId]
      if (items.length > 0) {
        const within = closestCorners({
          ...args,
          droppableContainers: args.droppableContainers.filter((c) =>
            items.includes(Number(c.id))
          )
        })
        if (within.length) overId = within[0].id
      }
    }
    return [{ id: overId }]
  }

  const laneOf = (id: string | number): UserStatus | null => {
    if (isLaneId(id)) return id
    const n = Number(id)
    return (Object.keys(lanes) as UserStatus[]).find((k) => lanes[k].includes(n)) ?? null
  }

  const onDragStart = (e: DragStartEvent): void => {
    const id = Number(e.active.id)
    setActiveId(id)
    setFromLane(laneOf(id))
    setMenu(null)
  }

  const onDragOver = (e: DragOverEvent): void => {
    const active = Number(e.active.id)
    if (!e.over) return
    const to = laneOf(e.over.id)
    const from = laneOf(active)
    if (!from || !to || from === to) return
    setLanes((prev) => {
      const fromArr = prev[from].filter((x) => x !== active)
      const toArr = prev[to].filter((x) => x !== active)
      const overIdx = isLaneId(e.over!.id) ? toArr.length : toArr.indexOf(Number(e.over!.id))
      toArr.splice(overIdx >= 0 ? overIdx : toArr.length, 0, active)
      return { ...prev, [from]: fromArr, [to]: toArr }
    })
  }

  const onDragEnd = (e: DragEndEvent): void => {
    const active = Number(e.active.id)
    const to = laneOf(active)
    let finalLanes = lanes
    if (e.over && to && !isLaneId(e.over.id)) {
      const arr = [...lanes[to]]
      const oldIdx = arr.indexOf(active)
      const overIdx = arr.indexOf(Number(e.over.id))
      if (oldIdx >= 0 && overIdx >= 0 && oldIdx !== overIdx) {
        arr.splice(oldIdx, 1)
        arr.splice(overIdx, 0, active)
        finalLanes = { ...lanes, [to]: arr }
        setLanes(finalLanes)
      }
    }
    setActiveId(null)
    if (to && fromLane && to !== fromLane) void window.api.setProblemStatus(active, to)
    setFromLane(null)
    ;(Object.keys(finalLanes) as UserStatus[]).forEach((st) =>
      void window.api.reorderProblems(finalLanes[st])
    )
  }

  const openMenu = (e: React.MouseEvent, problem: Problem): void => {
    e.preventDefault()
    setMenu({ x: e.clientX, y: e.clientY, problem })
  }

  const menuItems = (p: Problem): MenuItem[] => [
    {
      label: p.marked === 1 ? 'Unmark' : 'Mark',
      onClick: async () => {
        await window.api.setProblemMarked(p.id, p.marked !== 1)
        await refresh()
      }
    },
    {
      label: 'Delete problem',
      danger: true,
      onClick: () => setConfirmDel(p)
    }
  ]

  if (!settings) return <div />
  const activeProblem = activeId !== null ? byId.get(activeId) : undefined

  return (
    <div className="flex h-full flex-col">
      <div className="px-7 pb-2 pt-6">
        <h1 className="text-xl font-bold text-slate-900">Progress board</h1>
        <p className="text-sm text-slate-500">
          Drag tokens between lanes. Right-click a token to mark or delete it.
        </p>
      </div>
      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
      >
        <div ref={boardRef} className="flex min-h-0 flex-1 overflow-hidden px-7 pb-6">
          {LANES.map((lane, i) => (
            <div key={lane.status} className="contents">
              <div style={{ flexGrow: weights[i], flexBasis: 0 }} className="flex min-w-0">
                <Lane lane={lane} ids={lanes[lane.status]} byId={byId} onOpen={openDetail} onMenu={openMenu} />
              </div>
              {i < LANES.length - 1 && <Splitter onDrag={(dx) => resizeLanes(i, dx)} />}
            </div>
          ))}
        </div>
        <DragOverlay>
          {activeProblem ? (
            <div style={{ width: 96 }}>
              <Token problem={activeProblem} settings={settings} fluid dragging />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {menu && (
        <ContextMenu x={menu.x} y={menu.y} items={menuItems(menu.problem)} onClose={() => setMenu(null)} />
      )}
      {confirmDel && (
        <ConfirmDialog
          title="Delete problem"
          message={`Remove "${cleanProblemName(confirmDel.title, confirmDel.id, confirmDel.slug)}" (#${confirmDel.id}) and all its local attempts? This only affects local records, not pbinfo.`}
          onConfirm={async () => {
            await window.api.deleteProblem(confirmDel.id)
            setConfirmDel(null)
            await refresh()
          }}
          onCancel={() => setConfirmDel(null)}
        />
      )}
    </div>
  )
}

function Lane({
  lane,
  ids,
  byId,
  onOpen,
  onMenu
}: {
  lane: {
    status: UserStatus
    title: string
    Icon: (p: { className?: string }) => JSX.Element
    accent: string
  }
  ids: number[]
  byId: Map<number, Problem>
  onOpen: (id: number) => void
  onMenu: (e: React.MouseEvent, p: Problem) => void
}): JSX.Element {
  const { setNodeRef, isOver } = useDroppable({ id: lane.status })
  return (
    <div
      ref={setNodeRef}
      className={`flex min-h-0 w-full flex-col rounded-2xl border bg-white/70 transition ${
        isOver ? 'border-brand-400 bg-brand-50/60' : 'border-slate-200'
      }`}
    >
      <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-3">
        <lane.Icon className={`h-5 w-5 shrink-0 ${lane.accent}`} />
        <span className="truncate font-semibold text-slate-800">{lane.title}</span>
        <span className="ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">
          {ids.length}
        </span>
      </div>
      <SortableContext items={ids} strategy={rectSortingStrategy}>
        <div className="grid flex-1 auto-rows-min grid-cols-2 content-start gap-3 overflow-y-auto p-3">
          {ids.length === 0 && (
            <div className="col-span-2 m-auto flex flex-col items-center gap-1 py-10 text-center text-xs text-slate-400">
              <span>Drop a token here</span>
            </div>
          )}
          {ids.map((id) => {
            const p = byId.get(id)
            return p ? (
              <SortableToken key={id} problem={p} onOpen={onOpen} onMenu={onMenu} />
            ) : null
          })}
        </div>
      </SortableContext>
    </div>
  )
}

function SortableToken({
  problem,
  onOpen,
  onMenu
}: {
  problem: Problem
  onOpen: (id: number) => void
  onMenu: (e: React.MouseEvent, p: Problem) => void
}): JSX.Element {
  const settings = useStore((s) => s.settings)!
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: problem.id
  })
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.35 : 1
  }
  return (
    <Token
      ref={setNodeRef}
      problem={problem}
      settings={settings}
      fluid
      style={style}
      attributes={attributes}
      listeners={listeners}
      onClick={() => onOpen(problem.id)}
      onContextMenu={(e) => onMenu(e, problem)}
    />
  )
}
