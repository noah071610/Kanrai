import type { Edge } from "@xyflow/react"

import type { StepNode } from "./model"

/**
 * Node placement: what the user dragged or resized wins, then whatever is
 * already on screen, and only nodes with neither get the default layout. A
 * live update therefore never throws away a manual arrangement.
 */

interface Placement {
  x: number
  y: number
  width?: number
  height?: number
}

// v2: the default layout became vertical; horizontal-era positions are dropped.
const storageKey = (flowId: string) => `kanrai:layout:v2:${flowId}`

function readSaved(flowId: string): Record<string, Placement> {
  try {
    return JSON.parse(localStorage.getItem(storageKey(flowId)) ?? "{}")
  } catch {
    return {}
  }
}

/** Merges into what is already stored for the node. */
export function savePlacement(flowId: string, nodeId: string, placement: Partial<Placement>) {
  try {
    const saved = readSaved(flowId)
    saved[nodeId] = { ...saved[nodeId], ...placement } as Placement
    localStorage.setItem(storageKey(flowId), JSON.stringify(saved))
  } catch {
    // storage unavailable (private mode): positions just do not persist
  }
}

export function clearPlacements(flowId: string) {
  try {
    localStorage.removeItem(storageKey(flowId))
  } catch {
    // ignore
  }
}

export function placeNodes(
  flowId: string,
  nodes: StepNode[],
  edges: Edge[],
  onScreen: Map<string, Placement>,
): StepNode[] {
  const saved = readSaved(flowId)

  const sized = nodes.map((node) => {
    const keep = saved[node.id] ?? onScreen.get(node.id)
    return {
      ...node,
      width: keep?.width ?? node.width,
      height: keep?.height ?? node.height,
      ...(keep ? { position: { x: keep.x, y: keep.y } } : {}),
      placed: !!keep,
    }
  })

  if (sized.some((n) => !n.placed)) {
    const positions = verticalLayout(sized, edges)
    for (const node of sized) {
      if (!node.placed) node.position = positions.get(node.id) ?? node.position
    }
  }

  return sized.map(({ placed: _placed, ...node }) => node)
}

const ROW_GAP = 56
const COL_GAP = 48
const SIDE_GAP = 40
const STACK_GAP = 16

/**
 * Top to bottom, one row per flow number:
 *
 *   - flow-0 client calls sit side by side in the top row, all feeding flow-1;
 *   - the main line runs down the centre column;
 *   - fails sit in a column to the right of the step they exit from, stacked
 *     and centred on its row, so several fails fan out from one step (1:N);
 *   - a branch fans its arms out into evenly spaced columns around the centre,
 *     and the flow comes back to the centre where they merge.
 *
 * Which column a node is in comes from walking the server's edges, not from
 * re-deriving the branch rules.
 */
function verticalLayout(nodes: StepNode[], edges: Edge[]) {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const out = new Map<string, string[]>()
  for (const e of edges) out.set(e.source, [...(out.get(e.source) ?? []), e.target])

  const w = (n: StepNode) => n.width ?? 200
  const h = (n: StepNode) => n.height ?? 80
  const isFail = (n: StepNode) => n.data.variant === "fail" || n.data.variant === "soft-fail"

  // Side fails: a fail reached from a regular step. A fail reached straight
  // from a branch is an arm of its own and stays in the arm's column.
  const sideFails = new Map<string, StepNode[]>()
  const side = new Set<string>()
  for (const e of edges) {
    const source = byId.get(e.source)
    const target = byId.get(e.target)
    if (!source || !target || !isFail(target) || source.data.variant === "branch") continue
    sideFails.set(source.id, [...(sideFails.get(source.id) ?? []), target])
    side.add(target.id)
  }

  // Columns: every node starts in the centre; arms are walked from each branch.
  const armOf = new Map<string, string>()
  const arms: { branch: string; members: StepNode[] }[] = []
  for (const branch of nodes.filter((n) => n.data.variant === "branch")) {
    for (const headId of out.get(branch.id) ?? []) {
      const head = byId.get(headId)
      if (!head || head.data.case === undefined || side.has(head.id)) continue
      const members: StepNode[] = []
      let current: StepNode | undefined = head
      while (current && !armOf.has(current.id)) {
        armOf.set(current.id, branch.id)
        members.push(current)
        const armCase: string | undefined = current.data.case
        current = (out.get(current.id) ?? [])
          .map((id) => byId.get(id))
          .find((n) => n && n.data.case === armCase && !side.has(n.id))
      }
      arms.push({ branch: branch.id, members })
    }
  }

  const stackHeight = (fails: StepNode[]) =>
    fails.reduce((sum, f) => sum + h(f), 0) + STACK_GAP * Math.max(0, fails.length - 1)

  // Rows: y per flow number, tall enough for the tallest node or fail stack in the row.
  const rowOf = (n: StepNode) => n.data.order
  const rowHeight = new Map<number, number>()
  for (const n of nodes) {
    if (side.has(n.id)) continue
    const tallest = Math.max(h(n), stackHeight(sideFails.get(n.id) ?? []))
    rowHeight.set(rowOf(n), Math.max(rowHeight.get(rowOf(n)) ?? 0, tallest))
  }
  const rowTop = new Map<number, number>()
  let y = 0
  for (const order of [...rowHeight.keys()].sort((a, b) => a - b)) {
    rowTop.set(order, y)
    y += rowHeight.get(order)! + ROW_GAP
  }

  const centreX = new Map<string, number>()
  for (const n of nodes) if (!side.has(n.id) && !armOf.has(n.id)) centreX.set(n.id, 0)

  // Client calls (N:1) share row 0, so spread them out centred over flow-1.
  const clients = nodes.filter((n) => n.data.variant === "client")
  const clientsWidth = clients.reduce((sum, n) => sum + w(n), 0) + COL_GAP * Math.max(0, clients.length - 1)
  let clientLeft = -clientsWidth / 2
  for (const n of clients) {
    centreX.set(n.id, clientLeft + w(n) / 2)
    clientLeft += w(n) + COL_GAP
  }

  // Arms of one branch sit side by side, each as wide as its widest node plus
  // that node's side fails, and the group is centred under the branch.
  const widthWithFails = (n: StepNode) => {
    const fails = sideFails.get(n.id) ?? []
    return w(n) + (fails.length ? SIDE_GAP + Math.max(...fails.map(w)) : 0)
  }
  for (const branchId of new Set(arms.map((a) => a.branch))) {
    const group = arms.filter((a) => a.branch === branchId)
    const columns = group.map((arm) => ({
      arm,
      nodeWidth: Math.max(...arm.members.map(w)),
      full: Math.max(...arm.members.map(widthWithFails)),
    }))
    let left = 0
    const centres = columns.map((c) => {
      const centre = left + c.nodeWidth / 2
      left += c.full + COL_GAP
      return centre
    })
    const shift = (centres[0]! + centres[centres.length - 1]!) / 2
    columns.forEach((c, i) => {
      for (const m of c.arm.members) centreX.set(m.id, centres[i]! - shift)
    })
  }

  const positions = new Map<string, { x: number; y: number }>()
  const place = (n: StepNode, cx: number) => {
    const top = rowTop.get(rowOf(n)) ?? 0
    const rowH = rowHeight.get(rowOf(n)) ?? h(n)
    positions.set(n.id, { x: cx - w(n) / 2, y: top + (rowH - h(n)) / 2 })
  }

  for (const n of nodes) {
    if (side.has(n.id)) continue
    const cx = centreX.get(n.id) ?? 0
    place(n, cx)
    const fails = sideFails.get(n.id) ?? []
    if (!fails.length) continue
    const top = rowTop.get(rowOf(n)) ?? 0
    const rowH = rowHeight.get(rowOf(n)) ?? h(n)
    const left = cx + w(n) / 2 + SIDE_GAP
    let y = top + (rowH - stackHeight(fails)) / 2
    for (const fail of fails) {
      positions.set(fail.id, { x: left, y })
      y += h(fail) + STACK_GAP
    }
  }

  return positions
}

const BEND = 28

/**
 * Where each orthogonal edge turns. A branch fans out right under the diamond
 * and arms bend right above the node they merge into, so every arm reads as
 * splitting and then joining — the default midpoint bend would cut across
 * neighbouring arms of different lengths.
 */
export function routeEdges(nodes: StepNode[], edges: Edge[]): Edge[] {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  return edges.map((edge) => {
    const source = byId.get(edge.source)
    const target = byId.get(edge.target)
    if (!source || !target || edge.sourceHandle !== "bottom") return edge

    const gap = target.position.y - (source.position.y + (source.height ?? 80))
    if (gap <= BEND * 2) return edge

    const merging = source.data.case !== undefined && target.data.case === undefined
    const splitting = source.data.variant === "branch"
    if (!merging && !splitting) return edge

    const stepPosition = merging ? 1 - BEND / gap : BEND / gap
    return { ...edge, pathOptions: { stepPosition } } as Edge
  })
}
