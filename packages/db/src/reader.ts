import type { DbTable, Diagnostic } from "@kanrai/core"

export interface Reader {
  /** Whether a change to this project-relative path can affect the schema. */
  relevant: (relative: string) => boolean
  read: () => Promise<{ tables: DbTable[]; diagnostics: Diagnostic[] }>
}
