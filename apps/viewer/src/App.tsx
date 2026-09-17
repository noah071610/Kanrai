import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { AlertTriangle, ChevronRight, Database, Folder, Languages, RefreshCw, RotateCcw, Search } from "lucide-react"
import { useMemo, useState } from "react"

import { useApiData, type Flow, type FlowsPayload } from "./api"
import { FlowCanvas } from "./graph/FlowCanvas"
import { Inspector } from "./graph/Inspector"
import { buildGraph } from "./graph/model"
import { PROMPT_LANGUAGES, type PromptLanguage } from "./prompts"
import { useViewerStore } from "./store"

const METHOD_TONE: Record<string, string> = {
  GET: "text-emerald-600 dark:text-emerald-400",
  POST: "text-blue-600 dark:text-blue-400",
  PUT: "text-amber-600 dark:text-amber-400",
  PATCH: "text-amber-600 dark:text-amber-400",
  DELETE: "text-rose-600 dark:text-rose-400",
}

type RouteTree = {
  flows: Flow[]
  groups: { name: string; tree: RouteTree }[]
}

function endpointSegments(endpoint: string) {
  return endpoint.split("?")[0]?.split("/").filter(Boolean) ?? []
}

function sharedSegmentCount(flows: Flow[]) {
  const paths = flows.map((flow) => endpointSegments(flow.endpoint))
  let count = 0
  while (paths[0]?.[count] && paths.every((path) => path[count] === paths[0]?.[count])) count++
  return count
}

function buildRouteTree(flows: Flow[]): RouteTree {
  const start = sharedSegmentCount(flows)
  // Keep only the useful part of a path: api/auth, never api/auth/login/... .
  const levels = start > 0 ? 1 : 2

  const build = (candidates: Flow[], segment: number, remaining: number): RouteTree => {
    const direct: Flow[] = []
    const buckets = new Map<string, Flow[]>()

    for (const flow of candidates) {
      const name = endpointSegments(flow.endpoint)[segment]
      if (!name) direct.push(flow)
      else buckets.set(name, [...(buckets.get(name) ?? []), flow])
    }

    // One bucket is just another shared prefix, not a useful folder.
    if (remaining === 0 || buckets.size <= 1) return { flows: candidates, groups: [] }

    return {
      flows: direct,
      groups: [...buckets].map(([name, members]) => ({ name, tree: build(members, segment + 1, remaining - 1) })),
    }
  }

  return build(flows, start, levels)
}

export function App({ navigationWindow = window }: { navigationWindow?: Window }) {
  const { flows, db, error, rescan } = useApiData()
  // The selected flow lives in the URL hash, so a reload or a shared link keeps it.
  const [selectedFlowId, setSelectedFlowId] = useState<string | null>(() =>
    navigationWindow.location.hash ? decodeURIComponent(navigationWindow.location.hash.slice(1)) : null,
  )
  const selectedNodeIds = useViewerStore((s) => s.selectedNodeIds)
  const selectNode = useViewerStore((s) => s.select)
  const selectAll = useViewerStore((s) => s.selectAll)
  const setTab = useViewerStore((s) => s.setTab)
  const promptLanguage = useViewerStore((s) => s.promptLanguage)
  const setPromptLanguage = useViewerStore((s) => s.setPromptLanguage)
  const [query, setQuery] = useState("")
  const [resetToken, setResetToken] = useState(0)

  const flow = flows?.flows.find((f) => f.id === selectedFlowId) ?? flows?.flows[0]

  // In selection order; the last one is what the info tab shows.
  const flowNodes = useMemo(() => (flows && flow ? buildGraph(flow, flows, db).nodes : []), [flows, flow, db])
  const selectedNodes = useMemo(() => {
    const byId = new Map(flowNodes.map((node) => [node.id, node]))
    return selectedNodeIds.flatMap((id) => byId.get(id) ?? [])
  }, [flowNodes, selectedNodeIds])

  // Hooks stay above the early returns below: React needs the same hook order
  // on the loading render and the loaded one.
  const routeTree = useMemo(() => buildRouteTree(flows?.flows ?? []), [flows])
  const visibleIds = useMemo(
    () =>
      new Set(
        (flows?.flows ?? []).filter((f) => f.id.toLowerCase().includes(query.trim().toLowerCase())).map((f) => f.id),
      ),
    [flows, query],
  )

  if (error) {
    return (
      <Empty title="Can't reach the index">
        <p>{error}</p>
        <p>
          Is <code className="font-mono">kanrai visualize</code> still running?
        </p>
      </Empty>
    )
  }
  if (!flows) return <Empty title="Loading…" />
  if (flows.flows.length === 0) {
    return (
      <Empty title="No flows yet">
        <p>
          Add annotations like <code className="font-mono">// [POST: /api/login flow-1] …</code> to your handlers, then
          save.
        </p>
      </Empty>
    )
  }

  const errorCount = flows.diagnostics.filter((d) => d.severity === "error").length

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      <aside className="flex w-[300px] shrink-0 flex-col border-r">
        <header className="flex items-center gap-2 border-b px-4 py-3">
          <span className="font-semibold tracking-tight">kanrai</span>
          <span className="text-xs text-muted-foreground">{flows.flows.length} flows</span>
          {errorCount > 0 && (
            <span className="rounded-full bg-rose-600 px-1.5 text-[11px] font-semibold text-white">{errorCount}</span>
          )}
          <label className="ml-auto flex items-center gap-1 text-muted-foreground" title="Prompt language">
            <Languages className="size-3.5" />
            <span className="sr-only">Prompt language</span>
            <select
              value={promptLanguage}
              onChange={(event) => setPromptLanguage(event.target.value as PromptLanguage)}
              className="bg-transparent text-xs text-foreground outline-none"
              aria-label="Prompt language"
            >
              {PROMPT_LANGUAGES.map(({ value, label }) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <Button variant="ghost" size="icon-sm" onClick={() => void rescan()} aria-label="Rescan">
            <RefreshCw />
          </Button>
        </header>

        <label className="flex items-center gap-2 border-b px-4 py-2 text-muted-foreground">
          <Search className="size-3.5" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter endpoints"
            className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
        </label>

        <RouteList
          tree={routeTree}
          visibleIds={visibleIds}
          flows={flows}
          activeId={flow?.id}
          onPick={(id) => {
            setSelectedFlowId(id)
            selectNode(null)
            navigationWindow.history.replaceState(null, "", `#${encodeURIComponent(id)}`)
          }}
        />

        <footer className="flex items-center gap-2 border-t px-4 py-2 text-[11px] text-muted-foreground">
          <Database className="size-3.5" />
          {db ? `${db.orm} · ${db.tables.length} tables` : "no DB schema"}
          <span className="ml-auto">updated {new Date(flows.generatedAt).toLocaleTimeString()}</span>
        </footer>
      </aside>

      {flow && (
        <main className="flex min-w-0 flex-1 flex-col">
          <FlowHeader
            flow={flow}
            flows={flows}
            onPick={(id) => selectNode(id)}
            onSelectAll={() => {
              selectAll(flowNodes.map(({ id }) => id))
              setTab("prompt")
            }}
            onReset={() => setResetToken((t) => t + 1)}
          />
          <div className="relative min-h-0 flex-1">
            <FlowCanvas
              flow={flow}
              flows={flows}
              db={db}
              selectedIds={selectedNodeIds}
              onSelect={selectNode}
              resetToken={resetToken}
            />
          </div>
        </main>
      )}

      {selectedNodes.length > 0 && (
        <Inspector
          nodes={selectedNodes}
          allNodes={flowNodes}
          root={flows.root}
          db={db}
          onClose={() => selectNode(null)}
        />
      )}
    </div>
  )
}

function RouteList({
  tree,
  visibleIds,
  flows,
  activeId,
  onPick,
  nested = false,
}: {
  tree: RouteTree
  visibleIds: Set<string>
  flows: FlowsPayload
  activeId: string | undefined
  onPick: (id: string) => void
  nested?: boolean
}) {
  const hasVisible = (node: RouteTree): boolean =>
    node.flows.some((flow) => visibleIds.has(flow.id)) || node.groups.some((group) => hasVisible(group.tree))

  return (
    <ul className={cn(nested ? "ml-3 space-y-0.5" : "flex-1 space-y-0.5 overflow-y-auto p-1.5")}>
      {tree.groups
        .filter((group) => hasVisible(group.tree))
        .map((group) => (
          <li key={group.name}>
            <details open className="group">
              <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted [&::-webkit-details-marker]:hidden">
                <ChevronRight className="size-3 transition-transform group-open:rotate-90" />
                <Folder className="size-3.5" />
                {group.name}
              </summary>
              <RouteList
                tree={group.tree}
                visibleIds={visibleIds}
                flows={flows}
                activeId={activeId}
                onPick={onPick}
                nested
              />
            </details>
          </li>
        ))}
      {tree.flows
        .filter((flow) => visibleIds.has(flow.id))
        .map((flow) => (
          <li key={flow.id}>
            <FlowItem flow={flow} flows={flows} active={flow.id === activeId} onClick={() => onPick(flow.id)} />
          </li>
        ))}
    </ul>
  )
}

function FlowItem({
  flow,
  flows,
  active,
  onClick,
}: {
  flow: Flow
  flows: FlowsPayload
  active: boolean
  onClick: () => void
}) {
  const broken = flows.diagnostics.some((d) => d.flowId === flow.id && d.severity === "error")
  const count = (kind: string) => flow.steps.filter((s) => s.kind === kind).length
  return (
    <button
      onClick={onClick}
      className={cn("flex w-full flex-col gap-1 rounded-md px-2.5 py-2 text-left hover:bg-muted", active && "bg-muted")}
    >
      <span className="flex items-baseline gap-2">
        <span className={cn("w-12 shrink-0 font-mono text-[11px] font-semibold", METHOD_TONE[flow.method])}>
          {flow.method}
        </span>
        <span className="truncate font-mono text-[13px]">{flow.endpoint}</span>
        {broken && <AlertTriangle className="ml-auto size-3.5 shrink-0 text-rose-600" />}
      </span>
      <span className="flex gap-2 pl-14 font-mono text-[10px] text-muted-foreground">
        <span>{flow.steps.length} steps</span>
        {count("branch") > 0 && <span className="text-violet-600 dark:text-violet-400">◇{count("branch")}</span>}
        {count("db") > 0 && <span className="text-sky-600 dark:text-sky-400">⛁{count("db")}</span>}
        {count("api") > 0 && <span className="text-fuchsia-600 dark:text-fuchsia-400">⇄{count("api")}</span>}
        {count("fail") > 0 && <span className="text-rose-600 dark:text-rose-400">△{count("fail")}</span>}
      </span>
    </button>
  )
}

function FlowHeader({
  flow,
  flows,
  onPick,
  onSelectAll,
  onReset,
}: {
  flow: Flow
  flows: FlowsPayload
  onPick: (id: string) => void
  onSelectAll: () => void
  onReset: () => void
}) {
  const problems = flows.diagnostics.filter((d) => d.flowId === flow.id)
  const missing = flows.missing.filter((m) => m.flowId === flow.id).length
  return (
    <div className="border-b px-5 py-3">
      <h1 className="flex items-baseline gap-3 font-mono text-lg font-semibold">
        <button
          type="button"
          onClick={onSelectAll}
          className="flex items-baseline gap-3 text-left hover:underline"
          aria-label={`Select all steps for ${flow.endpoint}`}
        >
          <span className={cn("text-sm", METHOD_TONE[flow.method])}>{flow.method}</span>
          {flow.endpoint}
        </button>
        <button
          type="button"
          onClick={onSelectAll}
          className="rounded-full border border-primary/25 bg-primary/10 px-2 py-0.5 font-sans text-[11px] font-medium text-primary hover:bg-primary/15"
        >
          Select all
        </button>
        {missing > 0 && (
          <span className="rounded-md bg-muted px-1.5 font-mono text-[11px] font-normal text-muted-foreground">
            {missing} missing
          </span>
        )}
        <Button
          variant="outline"
          size="sm"
          className="ml-auto self-center font-sans font-medium"
          onClick={onReset}
          title="Forget dragged positions and sizes for this route and restore the default layout"
        >
          <RotateCcw /> Reset layout
        </Button>
      </h1>
      {problems.length > 0 && (
        <ul className="mt-2 space-y-0.5 border-l-2 border-rose-500 pl-3 text-xs">
          {problems.map((d, i) => (
            <li key={i}>
              <button
                className={cn(
                  "text-left hover:underline",
                  d.severity === "error" ? "text-rose-600 dark:text-rose-400" : "text-amber-600 dark:text-amber-400",
                )}
                onClick={() => d.filePath && onPick(`${d.filePath}:${d.line}`)}
              >
                <span className="font-mono">[{d.code}]</span> {d.message}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Empty({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <main className="mx-auto mt-[18vh] max-w-lg space-y-2 px-6 text-muted-foreground">
      <h1 className="text-xl font-semibold text-foreground">{title}</h1>
      {children}
    </main>
  )
}
