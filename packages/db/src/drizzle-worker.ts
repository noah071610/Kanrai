/**
 * Child process: `node drizzle-worker.js <root>`. Executes the user's Drizzle
 * schema files and prints `{ tables, diagnostics, globs }` as JSON to stdout.
 *
 * Runs out of process because it executes user code: a schema file with side
 * effects (`drizzle(process.env.DATABASE_URL)`) or a hang must not take the
 * watcher down with it, and the module cache must be fresh on every run.
 */
import type { DbColumn, DbTable, Diagnostic } from "@kanrai/core"
import fg from "fast-glob"
import { createJiti } from "jiti"
import { readFile, stat } from "node:fs/promises"
import path from "node:path"

const DIALECTS: [module: string, table: string][] = [
  ["pg-core", "PgTable"],
  ["mysql-core", "MySqlTable"],
  ["sqlite-core", "SQLiteTable"],
  ["singlestore-core", "SingleStoreTable"],
  ["gel-core", "GelTable"],
]
const CODE_EXT = "{ts,mts,cts,js,mjs,cjs}"

// Drizzle's column objects are untyped from here; only the fields read below.
interface AnyColumn {
  name: string
  notNull: boolean
  isUnique: boolean
  primary: boolean
  enumValues?: string[]
  getSQLType(): string
}
interface TableConfig {
  name: string
  columns: AnyColumn[]
  primaryKeys?: { columns: AnyColumn[] }[]
  uniqueConstraints?: { columns: AnyColumn[] }[]
  indexes?: { config: { unique?: boolean; columns: unknown[] } }[]
}

async function main() {
  const root = path.resolve(process.argv[2] ?? ".")
  const jiti = createJiti(path.join(root, "__kanrai__.js"), { interopDefault: true })
  const diagnostics: Diagnostic[] = []
  const fail = (message: string, filePath?: string) =>
    diagnostics.push({ code: "db-parse", severity: "warning", message, ...(filePath ? { filePath, line: 1 } : {}) })

  const [configFile] = await fg(`drizzle.config.${CODE_EXT}`, { cwd: root })
  if (!configFile) {
    fail("Drizzle detected but no drizzle.config file at the project root.")
    return { tables: [], diagnostics, globs: [] }
  }
  const config = (await jiti.import(path.join(root, configFile), { default: true })) as {
    schema?: string | string[]
  }
  const entries = [config.schema ?? []].flat()

  // `schema` may name files, globs or directories.
  const globs: string[] = []
  for (const entry of entries) {
    const clean = entry.replace(/^\.\//, "").replace(/\/$/, "")
    const isDir = await stat(path.join(root, clean)).then(
      (s) => s.isDirectory(),
      () => false,
    )
    globs.push(isDir ? `${clean}/**/*.${CODE_EXT}` : clean)
  }
  const files = (await fg(globs, { cwd: root, ignore: ["**/node_modules/**"] })).sort()

  const orm = (await jiti.import("drizzle-orm")) as { is: (v: unknown, c: unknown) => boolean }
  const dialects: { Table: unknown; getTableConfig: (t: unknown) => TableConfig }[] = []
  for (const [module, table] of DIALECTS) {
    try {
      const mod = (await jiti.import(`drizzle-orm/${module}`)) as Record<string, unknown>
      const Table = mod[table]
      if (Table && typeof mod.getTableConfig === "function") {
        dialects.push({ Table, getTableConfig: mod.getTableConfig as never })
      }
    } catch {
      // dialect not shipped by this drizzle-orm version
    }
  }

  const tables: DbTable[] = []
  const seen = new Set<unknown>()
  for (const filePath of files) {
    let mod: Record<string, unknown>
    try {
      mod = (await jiti.import(path.join(root, filePath))) as Record<string, unknown>
    } catch (error) {
      fail(`Could not load Drizzle schema file: ${error instanceof Error ? error.message : String(error)}`, filePath)
      continue
    }
    const text = await readFile(path.join(root, filePath), "utf8")

    for (const [exportName, value] of Object.entries(mod)) {
      if (!value || typeof value !== "object" || seen.has(value)) continue
      const dialect = dialects.find((d) => orm.is(value, d.Table))
      if (!dialect) continue
      seen.add(value) // re-exported from an index file

      const cfg = dialect.getTableConfig(value)
      const names = (cols: unknown[]) =>
        cols.flatMap((c) => (c && typeof c === "object" && "name" in c ? [String(c.name)] : []))
      const composite = [
        ...(cfg.primaryKeys ?? []).map((p) => names(p.columns)),
        ...(cfg.uniqueConstraints ?? []).map((u) => names(u.columns)),
        ...(cfg.indexes ?? []).filter((i) => i.config.unique).map((i) => names(i.config.columns)),
      ]
      const primary = new Set(names((cfg.primaryKeys ?? []).flatMap((p) => p.columns)))

      const columns = cfg.columns.map(
        (c): DbColumn => ({
          name: c.name,
          type: c.getSQLType(),
          nullable: !c.notNull,
          unique: c.isUnique || c.primary || composite.some((g) => g.length === 1 && g[0] === c.name),
          primary: c.primary || primary.has(c.name),
          ...(c.enumValues?.length ? { enumValues: [...c.enumValues] } : {}),
        }),
      )

      const at = new RegExp(`Table\\s*\\(\\s*["'\`]${cfg.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'\`]`).exec(text)
      tables.push({
        name: cfg.name,
        ...(exportName !== cfg.name ? { model: exportName } : {}),
        filePath,
        line: at ? text.slice(0, at.index).split("\n").length : 1,
        columns,
        uniques: composite.filter((g) => g.length > 1),
      })
    }
  }

  return { tables, diagnostics, globs: [configFile, ...globs] }
}

main().then(
  (result) => process.stdout.write(JSON.stringify(result)),
  (error) => {
    process.stderr.write(error instanceof Error ? (error.stack ?? error.message) : String(error))
    process.exit(1)
  },
)
