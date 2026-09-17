import type { DbColumn, DbTable } from "@kanrai/core"
import { getSchema, type Attr, type BlockAttribute, type Field, type Model } from "@mrleebo/prisma-ast"
import fg from "fast-glob"
import { readFile } from "node:fs/promises"
import path from "node:path"

import type { Reader } from "./reader.js"

/**
 * Parses `.prisma` files as text — no Prisma engine, no generated client, no
 * coupling to the user's Prisma version. Handles split schemas
 * (`prisma/schema/*.prisma`) by reading every file together.
 */
export function prismaReader(root: string, exclude: string[]): Reader {
  return {
    relevant: (relative) => relative.endsWith(".prisma"),
    async read() {
      const files = await fg("**/*.prisma", { cwd: root, ignore: exclude })
      const sources = await Promise.all(
        files.sort().map(async (filePath) => ({
          filePath,
          text: await readFile(path.join(root, filePath), "utf8"),
        })),
      )

      const models: { filePath: string; text: string; model: Model }[] = []
      const enums = new Map<string, string[]>()
      for (const { filePath, text } of sources) {
        for (const block of getSchema(text).list) {
          if (block.type === "model") models.push({ filePath, text, model: block })
          if (block.type === "enum") {
            enums.set(
              block.name,
              block.enumerators.flatMap((e) => (e.type === "enumerator" ? [e.name] : [])),
            )
          }
        }
      }
      const modelNames = new Set(models.map((m) => m.model.name))

      const tables = models.map(({ filePath, text, model }): DbTable => {
        const fields = model.properties.filter((p): p is Field => p.type === "field")
        const blockAttrs = model.properties.filter((p): p is BlockAttribute => p.type === "attribute")
        const columnName = new Map(fields.map((f) => [f.name, stringArg(attr(f.attributes, "map")) ?? f.name]))
        const names = (list: string[]) => list.map((n) => columnName.get(n) ?? n)

        const compositeId = fieldList(blockAttrs.find((a) => a.name === "id"))
        const uniques = blockAttrs.filter((a) => a.name === "unique").map((a) => names(fieldList(a)))

        const columns = fields
          // Relation fields (`posts Post[]`, `author User`) are not columns.
          .filter((f) => typeof f.fieldType !== "string" || !modelNames.has(f.fieldType))
          .map((f): DbColumn => {
            const type = typeof f.fieldType === "string" ? f.fieldType : `Unsupported`
            const primary = !!attr(f.attributes, "id") || compositeId.includes(f.name)
            const values = enums.get(type)
            return {
              name: columnName.get(f.name)!,
              type: f.array ? `${type}[]` : type,
              nullable: !!f.optional,
              unique: !!attr(f.attributes, "id") || !!attr(f.attributes, "unique"),
              primary,
              ...(values ? { enumValues: values } : {}),
            }
          })

        const mapped = stringArg(blockAttrs.find((a) => a.name === "map"))
        const line = text.split(/\r?\n/).findIndex((l) => new RegExp(`^\\s*model\\s+${model.name}\\s*\\{`).test(l)) + 1

        return {
          name: mapped ?? model.name,
          ...(mapped ? { model: model.name } : {}),
          filePath,
          line: Math.max(1, line),
          columns,
          uniques: compositeId.length > 1 ? [names(compositeId), ...uniques] : uniques,
        }
      })

      return { tables, diagnostics: [] }
    },
  }
}

function attr(attributes: Attr[] | undefined, name: string) {
  return attributes?.find((a) => a.name === name)
}

/** `@map("x")` / `@@map(name: "x")` → `x` */
function stringArg(attribute: Attr | undefined): string | undefined {
  const arg = attribute?.args?.[0]?.value
  const raw =
    typeof arg === "string"
      ? arg
      : arg && typeof arg === "object" && "type" in arg && arg.type === "keyValue"
        ? arg.value
        : undefined
  return typeof raw === "string" ? raw.replace(/^"|"$/g, "") : undefined
}

/** `@@unique([a, b])` / `@@id(fields: [a, b])` → `["a", "b"]` */
function fieldList(attribute: Attr | undefined): string[] {
  for (const { value } of attribute?.args ?? []) {
    let v = value as { type?: string; key?: string; value?: unknown; args?: unknown[] }
    if (v?.type === "keyValue") {
      if (v.key !== "fields") continue
      v = v.value as typeof v
    }
    if (v?.type === "array") {
      return (v.args ?? []).map((a) => (typeof a === "string" ? a : String((a as { name?: string }).name ?? a)))
    }
  }
  return []
}
