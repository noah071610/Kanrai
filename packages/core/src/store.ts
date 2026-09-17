import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import path from "node:path"

import {
  DB_SCHEMA_VERSION,
  DEFAULT_CONFIG,
  SCHEMA_VERSION,
  type DbSchema,
  type DbTable,
  type FlowIndex,
  type KanraiConfig,
} from "./types.js"

export const CONFIG_FILENAME = "kanrai.config.json"
export const INDEX_FILENAME = "flows.json"
export const DB_FILENAME = "db.json"

export function indexPath(root: string, config: KanraiConfig): string {
  return path.join(root, config.outDir, INDEX_FILENAME)
}

/** Reads `kanrai.config.json`, falling back to defaults field by field. */
export async function loadConfig(root: string): Promise<KanraiConfig> {
  try {
    const raw = await readFile(path.join(root, CONFIG_FILENAME), "utf8")
    const parsed = JSON.parse(raw) as Partial<KanraiConfig>
    return { ...DEFAULT_CONFIG, ...parsed }
  } catch {
    return { ...DEFAULT_CONFIG }
  }
}

export async function writeConfig(root: string, config: KanraiConfig): Promise<string> {
  const target = path.join(root, CONFIG_FILENAME)
  await writeFile(target, `${JSON.stringify(config, null, 2)}\n`, "utf8")
  return target
}

/**
 * Loads a previously written index. Returns null when it is absent, corrupt or
 * from an older schema — every one of those cases should trigger a full rescan
 * rather than an attempt to salvage the file.
 */
export async function readIndex(root: string, config: KanraiConfig): Promise<FlowIndex | null> {
  try {
    const raw = await readFile(indexPath(root, config), "utf8")
    const parsed = JSON.parse(raw) as FlowIndex
    if (parsed.schemaVersion !== SCHEMA_VERSION) return null
    if (!Array.isArray(parsed.flows)) return null
    return parsed
  } catch {
    return null
  }
}

export async function writeIndex(root: string, config: KanraiConfig, index: FlowIndex): Promise<string> {
  const target = indexPath(root, config)
  await mkdir(path.dirname(target), { recursive: true })
  await writeFile(target, `${JSON.stringify(index, null, 2)}\n`, "utf8")
  return target
}

export function dbPath(root: string, config: KanraiConfig): string {
  return path.join(root, config.outDir, DB_FILENAME)
}

/** Null when absent, corrupt or outdated — callers treat that as "no DB". */
export async function readDbSchema(root: string, config: KanraiConfig): Promise<DbSchema | null> {
  try {
    const parsed = JSON.parse(await readFile(dbPath(root, config), "utf8")) as DbSchema
    if (parsed.schemaVersion !== DB_SCHEMA_VERSION) return null
    if (!Array.isArray(parsed.tables)) return null
    return parsed
  } catch {
    return null
  }
}

export async function writeDbSchema(root: string, config: KanraiConfig, schema: DbSchema): Promise<string> {
  const target = dbPath(root, config)
  await mkdir(path.dirname(target), { recursive: true })
  await writeFile(target, `${JSON.stringify(schema, null, 2)}\n`, "utf8")
  return target
}

/** A stale db.json from a removed ORM would point at tables that are gone. */
export async function removeDbSchema(root: string, config: KanraiConfig) {
  await rm(dbPath(root, config), { force: true })
}

/**
 * Resolves the name in `db:<name>:<op>` against the schema. Matches the table
 * or the model name, case-insensitively, because annotations are written by
 * an agent that may think in either.
 */
export function findTable(schema: DbSchema, name: string): DbTable | undefined {
  const lower = name.toLowerCase()
  return schema.tables.find((t) => t.name.toLowerCase() === lower || t.model?.toLowerCase() === lower)
}

/**
 * Builds the editor deep link for a step. Used by the viewer so a node in the
 * graph can jump straight into the source.
 */
export function editorUri(config: KanraiConfig, root: string, filePath: string, line: number, column = 1): string {
  const absolute = path.resolve(root, filePath)
  return `${config.editorScheme}://file/${absolute}:${line}:${column}`
}
