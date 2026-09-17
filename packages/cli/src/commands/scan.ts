import {
  countBySeverity,
  loadConfig,
  scanProject,
  writeIndex,
  type DbSchema,
  type Diagnostic,
  type FlowIndex,
} from "@kanrai/core"
import { scanDb } from "@kanrai/db"
import path from "node:path"
import pc from "picocolors"

export async function runScan(options: { root: string; json: boolean; strict: boolean }) {
  const { root, json, strict } = options
  const config = await loadConfig(root)
  const index = await scanProject(root, config)
  const target = await writeIndex(root, config, index)
  const db = await scanDb(root, config)

  if (json) {
    console.log(JSON.stringify(index, null, 2))
  } else {
    printSummary(root, index, target)
    printDbSummary(db)
  }

  const { error } = countBySeverity(index.diagnostics)
  if (strict && error > 0) process.exit(1)
}

export function printSummary(root: string, index: FlowIndex, target: string) {
  const steps = index.flows.reduce((n, f) => n + f.steps.length, 0)
  const counts = countBySeverity(index.diagnostics)

  console.log(
    `${pc.bold(String(index.flows.length))} flows, ${pc.bold(String(steps))} steps ` +
      `across ${pc.bold(String(Object.keys(index.files).length))} files`,
  )
  console.log(pc.dim(`→ ${path.relative(root, target) || target}`))

  if (index.diagnostics.length === 0) {
    console.log(pc.green("No problems found."))
    return
  }

  console.log("")
  for (const d of index.diagnostics) {
    console.log(formatDiagnostic(d))
  }
  console.log("")
  console.log(
    `${counts.error ? pc.red(`${counts.error} error(s)`) : pc.green("0 errors")}, ` +
      `${counts.warning ? pc.yellow(`${counts.warning} warning(s)`) : "0 warnings"}`,
  )
}

/** DB is optional side data: one line when present, silence when not. */
export function printDbSummary(db: DbSchema | null) {
  if (!db) return
  console.log(
    pc.dim(
      db.tables.length
        ? `db: ${db.tables.length} tables from ${db.orm}`
        : `db: ${db.orm} detected but no tables were read — DB view is off`,
    ),
  )
  for (const d of db.diagnostics) console.log(formatDiagnostic(d))
}

function formatDiagnostic(d: Diagnostic): string {
  const tag =
    d.severity === "error" ? pc.red("error") : d.severity === "warning" ? pc.yellow("warn ") : pc.blue("info ")
  const where = d.filePath ? pc.dim(`${d.filePath}:${d.line ?? 1}`) : pc.dim("—")
  return `  ${tag} ${pc.dim(`[${d.code}]`)} ${d.message}\n        ${where}`
}
