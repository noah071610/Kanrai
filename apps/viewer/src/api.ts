import type { DbSchema, DbTable, FlowIndex, MissingStep } from "@kanrai/core"
import { useCallback, useEffect, useState } from "react"

// Type-only imports from core: nothing from its Node code reaches the bundle.
export type { DbColumn, DbSchema, DbTable, Diagnostic, Flow, FlowStep } from "@kanrai/core"

export interface FlowsPayload extends FlowIndex {
  links: { flowId: string; order: number; step: string; uri: string }[]
  edges: { flowId: string; from: string; to: string }[]
  missing: (MissingStep & { flowId: string })[]
}

export interface DbPayload extends DbSchema {
  links: { table: string; uri: string }[]
}

/**
 * Loads `/api/flows` and `/api/db` and keeps both live over SSE. `/api/db`
 * answers `null` when the project has no DB the tool can read — not an error.
 */
export function useApiData() {
  const [flows, setFlows] = useState<FlowsPayload | null>(null)
  const [db, setDb] = useState<DbPayload | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadFlows = useCallback(async () => {
    try {
      const res = await fetch("/api/flows")
      if (!res.ok) throw new Error(`server returned ${res.status}`)
      setFlows((await res.json()) as FlowsPayload)
      setError(null)
    } catch (err) {
      setError(String(err))
    }
  }, [])

  const loadDb = useCallback(async () => {
    try {
      const res = await fetch("/api/db")
      setDb(res.ok ? ((await res.json()) as DbPayload) : null)
    } catch {
      setDb(null)
    }
  }, [])

  useEffect(() => {
    void loadFlows()
    void loadDb()
    const source = new EventSource("/api/stream")
    source.onmessage = (event) => {
      const { type } = JSON.parse(event.data) as { type: string }
      if (type === "update") void loadFlows()
      if (type === "db-update") void loadDb()
    }
    return () => source.close()
  }, [loadFlows, loadDb])

  const rescan = useCallback(async () => {
    await fetch("/api/rescan", { method: "POST" })
  }, [])

  return { flows, db, error, rescan }
}

/** Same matching as core's `findTable`: table or model name, any case. */
export function findTable(db: DbSchema | null, name: string | undefined): DbTable | undefined {
  if (!db || !name) return undefined
  const lower = name.toLowerCase()
  return db.tables.find((t) => t.name.toLowerCase() === lower || t.model?.toLowerCase() === lower)
}

export function openInEditor(uri: string | undefined) {
  if (uri) window.location.href = uri
}
