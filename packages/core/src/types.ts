/**
 * The shape of `.kanrai/flows.json`.
 *
 * This file is the single contract between the parser, the CLI viewer and the
 * VS Code extension. Treat a change here as a breaking change: bump
 * SCHEMA_VERSION and make the store discard older files rather than trying to
 * migrate them in place.
 */

export const SCHEMA_VERSION = 3;

export type HttpMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE"
  | "HEAD"
  | "OPTIONS";

/**
 * What a step does, from the tokens after `flow-N`. No token means `step`.
 *
 * - `fail`   — the request does not complete normally here: a thrown error or
 *              a soft skip (e.g. a 200 that did nothing). Shares its number
 *              with the step it exits from.
 * - `branch` — the flow splits; the arms are the `case:` steps that follow.
 * - `db`     — a database read or write.
 * - `api`    — a call to an external service.
 */
export type StepKind = "step" | "fail" | "branch" | "db" | "api";

export type DbOp = "create" | "read" | "update" | "delete";

/**
 * Where a step lives, derived from its file path — not what it does. A `db`
 * step can sit in a `service` file when the ORM is called directly there.
 */
export type Layer = "route" | "service" | "repository";

/** One `// [POST: /api/example flow-1] ...` annotation found in source. */
export interface FlowStep {
  /**
   * Sequence number from `flow-N`. `0` is a client call site (frontend code
   * sending the request); a flow may have many of them, all leading to flow-1.
   */
  order: number;
  kind: StepKind;
  /** Branch arm label from `case:<label>`. Absent on the main line. */
  case?: string;
  /** `fail:<status>` — the HTTP status sent. Absent when not written. */
  status?: number;
  /** `db:<table>:<op>` — table or model name as written. */
  table?: string;
  op?: DbOp;
  /** `api:<service>` */
  service?: string;
  /** Free text after the bracket. */
  description: string;
  /** POSIX-style path relative to the project root. */
  filePath: string;
  /** From the file name or nearest matching folder. Absent when unknown. */
  layer?: Layer;
  /** 1-based line number — VS Code and editor URIs both expect 1-based. */
  line: number;
  /** 1-based column of the `[` character. */
  column: number;
  /** The whole matched comment, kept for display and debugging. */
  raw: string;
}

/** All steps that belong to a single endpoint, sorted by `order`. */
export interface Flow {
  /** Stable key: `"POST /api/example"`. Used as the id everywhere. */
  id: string;
  method: HttpMethod;
  endpoint: string;
  steps: FlowStep[];
}

export type DiagnosticSeverity = "error" | "warning" | "info";

export type DiagnosticCode =
  /** flow-1, flow-2, flow-4 — flow-3 is missing. */
  | "gap"
  /** Two annotations claim the same flow-N for one endpoint. */
  | "duplicate"
  /** The flow has steps but no flow-1, so there is no entry point. */
  | "no-entry"
  /** A single-step flow — usually means the author stopped halfway. */
  | "orphan"
  /** Looked like an annotation but did not match the grammar. */
  | "malformed"
  /** A `fail` whose flow-N has no regular step (same case) to exit from. */
  | "dangling-fail"
  /** `case:` steps with no `branch` step before them. */
  | "orphan-case"
  /** A `branch` step with no `case:` steps after it. */
  | "empty-branch"
  /** The ORM schema could not be read; the previous tables are kept. */
  | "db-parse";

export interface Diagnostic {
  code: DiagnosticCode;
  severity: DiagnosticSeverity;
  message: string;
  /** Present when the problem can be pinned to a source location. */
  filePath?: string;
  line?: number;
  column?: number;
  /** Present when the problem belongs to a known flow. */
  flowId?: string;
}

/** Per-file bookkeeping so incremental updates can skip untouched files. */
export interface FileRecord {
  /** Content hash at the time it was last parsed. */
  hash: string;
  /** Number of annotations found — lets you spot files that lost all theirs. */
  stepCount: number;
}

export interface FlowIndex {
  schemaVersion: number;
  /** ISO timestamp of the last write. */
  generatedAt: string;
  /** Absolute project root the relative paths are resolved against. */
  root: string;
  flows: Flow[];
  diagnostics: Diagnostic[];
  files: Record<string, FileRecord>;
}

export interface KanraiConfig {
  /** Globs to scan, relative to the project root. */
  include: string[];
  /** Globs to skip. */
  exclude: string[];
  /** Where the index is written, relative to the project root. */
  outDir: string;
  /** Milliseconds to wait for the filesystem to settle before re-indexing. */
  debounceMs: number;
  /** Editor URI scheme used for "jump to source" links in the viewer. */
  editorScheme: "vscode" | "vscode-insiders" | "cursor" | "windsurf";
  /** ORM to read the DB schema from. `auto` detects from package.json, then Python dependency files. */
  db: "auto" | Orm | false;
}

export type Orm =
  | "prisma"
  | "drizzle"
  | "typeorm"
  | "sequelize"
  | "django"
  | "sqlalchemy"
  | "sqlmodel";

export const DB_SCHEMA_VERSION = 1;

/**
 * The shape of `.kanrai/db.json`. Optional side data: it only exists when a
 * supported ORM was found, and nothing in `flows.json` depends on it.
 */
export interface DbSchema {
  schemaVersion: number;
  generatedAt: string;
  orm: Orm;
  tables: DbTable[];
  diagnostics: Diagnostic[];
}

export interface DbTable {
  /** Table name in the database. */
  name: string;
  /** Model / entity / class name when it differs from the table name. */
  model?: string;
  /** Where the model is defined — the jump target for `db:<table>`. */
  filePath: string;
  line: number;
  columns: DbColumn[];
  /** Composite unique constraints, as column names. */
  uniques: string[][];
}

export interface DbColumn {
  name: string;
  /** Type as the ORM declares it: `String`, `text`, `varchar`, `STRING`... */
  type: string;
  nullable: boolean;
  unique: boolean;
  primary: boolean;
  enumValues?: string[];
}

export const DEFAULT_CONFIG: KanraiConfig = {
  include: ["**/*.{ts,tsx,js,jsx,mjs,cjs,py,go,rb,java,kt,php,rs}"],
  exclude: [
    "**/node_modules/**",
    "**/dist/**",
    "**/build/**",
    "**/.next/**",
    "**/coverage/**",
    "**/.kanrai/**",
    "**/*.min.js",
    "**/.venv/**",
    "**/venv/**",
    "**/site-packages/**",
    "**/__pycache__/**",
    "**/.tox/**",
    "**/.mypy_cache/**",
    "**/.pytest_cache/**",
    "**/migrations/**",
    "**/alembic/versions/**",
  ],
  outDir: ".kanrai",
  debounceMs: 300,
  editorScheme: "vscode",
  db: "auto",
};
