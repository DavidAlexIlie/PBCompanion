import { useState } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  pointerWithin,
  type DragEndEvent,
  type DragStartEvent
} from '@dnd-kit/core'
import { useStore } from '../store'
import { GROUP_ICONS, IconPlus, IconClose } from './icons'
import Token from './Token'
import Splitter, { usePersistentNumber, clamp } from './Splitter'
import ContextMenu, { type MenuItem } from './ContextMenu'
import ConfirmDialog from './ConfirmDialog'
import type { Problem, GroupWithMembers } from '../../../shared/types'

const COLORS = ['#2563eb', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#64748b']
const ICON_KEYS = Object.keys(GROUP_ICONS)

export default function GroupsTab(): JSX.Element {
  const { problems, groups, settings, refresh, openDetail } = useStore()
  const [activeId, setActiveId] = useState<number | null>(null)
  const [libW, setLibW] = usePersistentNumber('layout.groupsLib', 460)

  // New-group form state
  const [name, setName] = useState('')
  const [color, setColor] = useState(COLORS[0])
  const [icon, setIcon] = useState(ICON_KEYS[0])

  // Per-group interactions
  const [menu, setMenu] = useState<{ x: number; y: number; group: GroupWithMembers } | null>(null)
  const [editing, setEditing] = useState<GroupWithMembers | null>(null)
  const [confirmDel, setConfirmDel] = useState<GroupWithMembers | null>(null)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  const createGroup = async (): Promise<void> => {
    const trimmed = name.trim()
    if (!trimmed) return
    await window.api.createGroup({ name: trimmed, color, icon })
    setName('')
    await refresh()
  }

  const onDragEnd = async (e: DragEndEvent): Promise<void> => {
    setActiveId(null)
    const problemId = Number(e.active.id)
    const overId = e.over?.id
    if (typeof overId === 'string' && overId.startsWith('group:')) {
      const groupId = Number(overId.slice('group:'.length))
      await window.api.addProblemToGroup(groupId, problemId)
      await refresh()
    }
  }

  if (!settings) return <div />
  const active = activeId !== null ? problems.find((p) => p.id === activeId) : undefined

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={(e: DragStartEvent) => setActiveId(Number(e.active.id))}
      onDragEnd={onDragEnd}
    >
      <div className="flex h-full min-h-0">
        {/* Left: library of all problems */}
        <div style={{ width: libW }} className="flex shrink-0 flex-col border-r border-slate-200 bg-white">
          <div className="px-6 pb-2 pt-6">
            <h1 className="text-xl font-bold text-slate-900">Library</h1>
            <p className="text-sm text-slate-500">Drag a problem into a group on the right.</p>
          </div>
          <div className="flex flex-1 flex-wrap content-start gap-4 overflow-y-auto p-6">
            {problems.length === 0 && (
              <div className="m-auto text-sm text-slate-400">No problems registered yet.</div>
            )}
            {problems.map((p) => (
              <DraggableLibToken key={p.id} problem={p} onOpen={openDetail} />
            ))}
          </div>
        </div>
        <Splitter onDrag={(dx) => setLibW(clamp(libW + dx, 300, window.innerWidth - 520))} />

        {/* Right: group creator + groups */}
        <div className="flex min-w-0 flex-1 flex-col overflow-y-auto bg-slate-50 p-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">New group</h2>
            <div className="mt-3 flex flex-col gap-3">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && createGroup()}
                placeholder="Group name (e.g. Tema 1, Recursivitate)"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
              />
              <ColorPicker value={color} onChange={setColor} />
              <IconPicker value={icon} onChange={setIcon} />
              <button
                onClick={createGroup}
                disabled={!name.trim()}
                className="flex items-center justify-center gap-1.5 rounded-lg bg-brand-600 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-40"
              >
                <IconPlus className="h-4 w-4" /> Create group
              </button>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-2">
            {groups.length === 0 && (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-10 text-center text-slate-400 xl:col-span-2">
                No groups yet. Create one above — it becomes a real folder on disk too.
              </div>
            )}
            {groups.map((g) => (
              <GroupCard
                key={g.id}
                group={g}
                problems={problems}
                onMenu={(e) => {
                  e.preventDefault()
                  setMenu({ x: e.clientX, y: e.clientY, group: g })
                }}
                onDelete={() => setConfirmDel(g)}
              />
            ))}
          </div>
        </div>
      </div>

      <DragOverlay>
        {active && settings ? <Token problem={active} settings={settings} compact dragging /> : null}
      </DragOverlay>

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={
            [
              { label: 'Edit group', onClick: () => setEditing(menu.group) },
              { label: 'Delete group', danger: true, onClick: () => setConfirmDel(menu.group) }
            ] as MenuItem[]
          }
        />
      )}
      {editing && (
        <GroupEditModal
          group={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null)
            await refresh()
          }}
        />
      )}
      {confirmDel && (
        <ConfirmDialog
          title="Delete group"
          message={`Delete the group "${confirmDel.name}"? The folder on disk is kept; only the grouping is removed.`}
          onConfirm={async () => {
            await window.api.deleteGroup(confirmDel.id)
            setConfirmDel(null)
            await refresh()
          }}
          onCancel={() => setConfirmDel(null)}
        />
      )}
    </DndContext>
  )
}

function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }): JSX.Element {
  return (
    <div className="flex items-center gap-2">
      <span className="w-12 text-xs text-slate-400">Color</span>
      {COLORS.map((c) => (
        <button
          key={c}
          onClick={() => onChange(c)}
          className={`h-6 w-6 rounded-full ring-2 ring-offset-2 transition ${
            value === c ? 'ring-slate-400' : 'ring-transparent'
          }`}
          style={{ backgroundColor: c }}
        />
      ))}
    </div>
  )
}

function IconPicker({ value, onChange }: { value: string; onChange: (k: string) => void }): JSX.Element {
  return (
    <div className="flex items-center gap-2">
      <span className="w-12 text-xs text-slate-400">Icon</span>
      {ICON_KEYS.map((k) => {
        const Ico = GROUP_ICONS[k]
        return (
          <button
            key={k}
            onClick={() => onChange(k)}
            className={`flex h-8 w-8 items-center justify-center rounded-lg border transition ${
              value === k
                ? 'border-brand-400 bg-brand-50 text-brand-600'
                : 'border-slate-200 text-slate-400 hover:bg-slate-50'
            }`}
          >
            <Ico className="h-5 w-5" />
          </button>
        )
      })}
    </div>
  )
}

function GroupEditModal({
  group,
  onClose,
  onSaved
}: {
  group: GroupWithMembers
  onClose: () => void
  onSaved: () => void
}): JSX.Element {
  const [name, setName] = useState(group.name)
  const [color, setColor] = useState(group.color ?? COLORS[0])
  const [icon, setIcon] = useState(group.icon ?? ICON_KEYS[0])

  const save = async (): Promise<void> => {
    if (!name.trim()) return
    await window.api.updateGroup(group.id, { name: name.trim(), color, icon })
    onSaved()
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/40 p-6" onMouseDown={onClose}>
      <div
        className="w-[420px] max-w-[92vw] animate-pop-in rounded-2xl bg-white p-6 shadow-lift"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-bold text-slate-900">Edit group</h3>
        <div className="mt-4 flex flex-col gap-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && save()}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
          />
          <ColorPicker value={color} onChange={setColor} />
          <IconPicker value={icon} onChange={setIcon} />
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100">
            Cancel
          </button>
          <button
            onClick={save}
            disabled={!name.trim()}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-40"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}

function DraggableLibToken({
  problem,
  onOpen
}: {
  problem: Problem
  onOpen: (id: number) => void
}): JSX.Element {
  const settings = useStore((s) => s.settings)!
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: problem.id })
  return (
    <Token
      ref={setNodeRef}
      problem={problem}
      settings={settings}
      compact
      attributes={attributes}
      listeners={listeners}
      style={{ opacity: isDragging ? 0.35 : 1 }}
      onClick={() => onOpen(problem.id)}
    />
  )
}

function GroupCard({
  group,
  problems,
  onMenu,
  onDelete
}: {
  group: GroupWithMembers
  problems: Problem[]
  onMenu: (e: React.MouseEvent) => void
  onDelete: () => void
}): JSX.Element {
  const { refresh, openDetail } = useStore()
  const { setNodeRef, isOver } = useDroppable({ id: `group:${group.id}` })
  const Ico = GROUP_ICONS[group.icon ?? 'folder'] ?? GROUP_ICONS.folder
  const members = group.problemIds
    .map((id) => problems.find((p) => p.id === id))
    .filter((p): p is Problem => !!p)

  const remove = async (problemId: number): Promise<void> => {
    await window.api.removeProblemFromGroup(group.id, problemId)
    await refresh()
  }

  return (
    <div
      ref={setNodeRef}
      onContextMenu={onMenu}
      className={`relative rounded-2xl border bg-white p-4 shadow-soft transition ${
        isOver ? 'border-brand-400 ring-2 ring-brand-100' : 'border-slate-200'
      }`}
    >
      <button
        onClick={onDelete}
        title="Delete group"
        className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-md text-slate-300 hover:bg-rose-50 hover:text-rose-600"
      >
        <IconClose className="h-4 w-4" />
      </button>
      <div className="mb-3 flex items-center gap-2.5 pr-9">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white"
          style={{ backgroundColor: group.color ?? '#2563eb' }}
        >
          <Ico className="h-5 w-5" />
        </span>
        <span className="truncate text-base font-semibold text-slate-800">{group.name}</span>
      </div>
      {members.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 py-6 text-center text-xs text-slate-400">
          Drop problems here
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {members.map((p) => (
            <div
              key={p.id}
              className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 py-1 pl-2.5 pr-1.5 text-sm"
            >
              <button onClick={() => openDetail(p.id)} className="font-semibold text-brand-700">
                #{p.id}
              </button>
              <button
                onClick={() => remove(p.id)}
                className="flex h-5 w-5 items-center justify-center rounded-full text-slate-300 hover:bg-rose-100 hover:text-rose-600"
              >
                <IconClose className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
