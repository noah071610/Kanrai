import fg from "fast-glob"
import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import path from "node:path"

import { flowId, parseSource, type ParsedStep } from "./parser.js"
import {
  SCHEMA_VERSION,
  type Diagnostic,
  type FileRecord,
  type Flow,
  type FlowIndex,
  type KanraiConfig,
} from "./types.js"
import { validateFlows } from "./validator.js"

function toPosix(p: string): string {
  return p.split(path.sep).join("/")
}

function hash(content: string): string {
  return createHash("sha1").update(content).digest("hex").slice(0, 16)
}

/**
 * Groups loose steps into flows and runs validation.
 *
 * Kept separate from file IO so both the full scan and the incremental update
 * funnel through exactly one assembly path — if these two ever diverge, the
 * watcher and the CLI start disagreeing and nobody can tell which is right.
 */
export function assemble(
  root: string,
  steps: ParsedStep[],
  parseDiagnostics: Diagnostic[],
  files: Record<string, FileRecord>,
): FlowIndex {
  const grouped = new Map<string, Flow>()

  for (const step of steps) {
    const id = flowId(step.method, step.endpoint)
    let flow = grouped.get(id)
    if (!flow) {
      flow = { id, method: step.method, endpoint: step.endpoint, steps: [] }
      grouped.set(id, flow)
    }
    const { method: _m, endpoint: _e, ...rest } = step
    flow.steps.push(rest)
  }

  const flows = [...grouped.values()].sort((a, b) => a.id.localeCompare(b.id))
  for (const flow of flows) {
    // Order, then main line before arms, then regular before fail.
    flow.steps.sort(
      (a, b) =>
        a.order - b.order ||
        (a.case ?? "").localeCompare(b.case ?? "") ||
        Number(a.kind === "fail") - Number(b.kind === "fail") ||
        a.filePath.localeCompare(b.filePath) ||
        a.line - b.line,
    )
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    root,
    flows,
    diagnostics: [...parseDiagnostics, ...validateFlows(flows)],
    files,
  }
}

/**
 * Walks the whole project. This is the baseline path — it always produces a
 * correct index, so `scan` doubles as the escape hatch when an incremental
 * update has drifted.
 */
export async function scanProject(root: string, config: KanraiConfig): Promise<FlowIndex> {
  const entries = await fg(config.include, {
    cwd: root,
    ignore: config.exclude,
    dot: false,
    onlyFiles: true,
    followSymbolicLinks: false,
  })

  const steps: ParsedStep[] = []
  const diagnostics: Diagnostic[] = []
  const files: Record<string, FileRecord> = {}

  await Promise.all(
    entries.map(async (relative) => {
      const filePath = toPosix(relative)
      let source: string
      try {
        source = await readFile(path.join(root, relative), "utf8")
      } catch {
        return // deleted mid-scan; the next run picks it up
      }
      const result = parseSource(filePath, source)
      if (result.steps.length === 0 && result.diagnostics.length === 0) return

      steps.push(...result.steps)
      diagnostics.push(...result.diagnostics)
      files[filePath] = { hash: hash(source), stepCount: result.steps.length }
    }),
  )

  return assemble(root, steps, diagnostics, files)
}

/**
 * Re-parses a single file and rebuilds the index from the previous one.
 *
 * Note this reuses the cached steps of every *other* file, so it is only as
 * correct as the previous index. Anything that can invalidate untouched files
 * (a config change, a rename storm) should fall back to `scanProject`.
 */
export async function updateFile(
  previous: FlowIndex,
  root: string,
  relativePath: string,
  event: "add" | "change" | "unlink",
): Promise<FlowIndex> {
  const filePath = toPosix(relativePath)
  const files = { ...previous.files }

  // Rebuild the loose-step list from every file except the one that changed.
  const steps: ParsedStep[] = []
  const diagnostics: Diagnostic[] = []

  for (const flow of previous.flows) {
    for (const step of flow.steps) {
      if (step.filePath === filePath) continue
      steps.push({ ...step, method: flow.method, endpoint: flow.endpoint })
    }
  }
  for (const diagnostic of previous.diagnostics) {
    // Only parse-time diagnostics are carried over; structural ones are
    // recomputed by `assemble`.
    if (diagnostic.code !== "malformed") continue
    if (diagnostic.filePath === filePath) continue
    diagnostics.push(diagnostic)
  }

  if (event === "unlink") {
    delete files[filePath]
    return assemble(root, steps, diagnostics, files)
  }

  let source: string
  try {
    source = await readFile(path.join(root, relativePath), "utf8")
  } catch {
    delete files[filePath]
    return assemble(root, steps, diagnostics, files)
  }

  const result = parseSource(filePath, source)
  steps.push(...result.steps)
  diagnostics.push(...result.diagnostics)

  if (result.steps.length === 0 && result.diagnostics.length === 0) {
    delete files[filePath]
  } else {
    files[filePath] = { hash: hash(source), stepCount: result.steps.length }
  }

  return assemble(root, steps, diagnostics, files)
}
