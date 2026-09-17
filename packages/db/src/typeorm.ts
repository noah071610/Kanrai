import type { DbColumn, DbTable } from "@kanrai/core"
import ts from "typescript"

import type { Reader } from "./reader.js"
import {
  Ref,
  collectEnums,
  createFileCache,
  decorators,
  isObject,
  lineOf,
  propName,
  type Value,
  type ValueObject,
} from "./ts.js"

const COLUMN_DECORATORS: Record<string, { type?: string; primary?: boolean; nullable?: boolean }> = {
  Column: {},
  PrimaryColumn: { primary: true },
  PrimaryGeneratedColumn: { type: "int", primary: true },
  ObjectIdColumn: { type: "objectId", primary: true },
  CreateDateColumn: { type: "timestamp" },
  UpdateDateColumn: { type: "timestamp" },
  DeleteDateColumn: { type: "timestamp", nullable: true },
  VersionColumn: { type: "int" },
}

interface ClassInfo {
  name: string
  parent?: string
  entity?: { name?: string; filePath: string; line: number }
  columns: DbColumn[]
  uniques: string[][]
}

/**
 * Reads `@Entity` classes from source. The TS property type is written right
 * there (`name: string`), which is exactly what runtime loading loses without
 * emitDecoratorMetadata.
 *
 * ponytail: ignores embedded columns (`@Column(() => Profile)`), FK columns
 * created by `@JoinColumn`, and custom NamingStrategy — default naming only.
 */
export function typeormReader(root: string, include: string[], exclude: string[]): Reader {
  const sourceFiles = createFileCache(
    root,
    include,
    exclude,
    /@(Entity|Column|PrimaryColumn|PrimaryGeneratedColumn)\b|\benum\s+\w+/,
  )

  return {
    relevant: (relative) => /\.[cm]?[jt]sx?$/.test(relative),
    async read() {
      const classes = new Map<string, ClassInfo>()
      const enums = new Map<string, string[]>()

      const files = await sourceFiles()
      for (const { sf } of files) collectEnums(sf, enums)

      for (const { filePath, sf } of files) {
        const visit = (node: ts.Node) => {
          if (ts.isClassDeclaration(node) && node.name) {
            classes.set(node.name.text, readClass(node, filePath, sf, enums))
          }
          ts.forEachChild(node, visit)
        }
        visit(sf)
      }

      const inherited = (info: ClassInfo, depth = 0): ClassInfo[] => {
        const parent = info.parent ? classes.get(info.parent) : undefined
        return parent && depth < 20 ? [...inherited(parent, depth + 1), info] : [info]
      }

      const tables: DbTable[] = []
      for (const info of classes.values()) {
        if (!info.entity) continue
        const chain = inherited(info)
        const table = info.entity.name ?? snakeCase(info.name)
        tables.push({
          name: table,
          ...(table !== info.name ? { model: info.name } : {}),
          filePath: info.entity.filePath,
          line: info.entity.line,
          columns: chain.flatMap((c) => c.columns),
          uniques: chain.flatMap((c) => c.uniques),
        })
      }
      return { tables, diagnostics: [] }
    },
  }
}

function readClass(
  node: ts.ClassDeclaration,
  filePath: string,
  sf: ts.SourceFile,
  enums: Map<string, string[]>,
): ClassInfo {
  const info: ClassInfo = { name: node.name!.text, columns: [], uniques: [] }

  const heritage = node.heritageClauses?.find((h) => h.token === ts.SyntaxKind.ExtendsKeyword)
  const parent = heritage?.types[0]?.expression
  if (parent && ts.isIdentifier(parent)) info.parent = parent.text

  const classUniques: Value[][] = []
  for (const d of decorators(node, sf)) {
    if (d.name === "Entity") {
      const [first] = d.args
      const name = typeof first === "string" ? first : isObject(first) ? first.name : undefined
      info.entity = {
        ...(typeof name === "string" ? { name } : {}),
        filePath,
        line: lineOf(node, sf),
      }
    }
    // @Unique(["a", "b"]) / @Unique("name", ["a", "b"])
    if (d.name === "Unique") classUniques.push(d.args)
    // @Index(["a", "b"], { unique: true })
    if (d.name === "Index" && d.args.some((a) => isObject(a) && a.unique === true)) {
      classUniques.push(d.args)
    }
  }

  const columnNames = new Map<string, string>()
  for (const member of node.members) {
    if (!ts.isPropertyDeclaration(member)) continue
    const decs = decorators(member, sf)
    const col = decs.find((d) => d.name in COLUMN_DECORATORS)
    if (!col) continue
    // Embedded: @Column(() => Profile)
    if (col.args[0] instanceof Ref && col.args[0].text.includes("=>")) continue

    const defaults = COLUMN_DECORATORS[col.name]!
    const options: ValueObject = Object.assign({}, ...col.args.filter(isObject)) as ValueObject
    let explicitType = [col.args[0], options.type].find((v) => typeof v === "string") as string | undefined
    // PrimaryGeneratedColumn("increment" | "identity" | "rowid" | "uuid")
    if (col.name === "PrimaryGeneratedColumn" && explicitType !== "uuid") explicitType = "int"
    const tsType = member.type?.getText(sf)
    const property = propName(member.name, sf)
    const name = typeof options.name === "string" ? options.name : property
    columnNames.set(property, name)

    const enumValues = Array.isArray(options.enum)
      ? options.enum.map(String)
      : options.enum instanceof Ref
        ? enums.get(options.enum.last)
        : undefined

    const indexedUnique = decs.some((d) => d.name === "Index" && d.args.some((a) => isObject(a) && a.unique === true))
    const primary = !!defaults.primary || options.primary === true

    info.columns.push({
      name,
      type: explicitType ?? (enumValues ? "enum" : undefined) ?? defaults.type ?? tsType ?? "unknown",
      nullable: options.nullable === true || (!!defaults.nullable && options.nullable !== false),
      unique: primary || options.unique === true || indexedUnique,
      primary,
      ...(enumValues ? { enumValues } : {}),
    })
  }

  for (const args of classUniques) {
    const list = args.find(Array.isArray)
    if (!list) continue
    const names = list.map((n) => columnNames.get(String(n)) ?? String(n))
    if (names.length === 1) {
      const column = info.columns.find((c) => c.name === names[0])
      if (column) column.unique = true
    } else {
      info.uniques.push(names)
    }
  }

  return info
}

/** TypeORM's DefaultNamingStrategy table name. */
function snakeCase(name: string): string {
  return name
    .replace(/([a-z\d])([A-Z])/g, "$1_$2")
    .replace(/([A-Z]+)([A-Z][a-z\d]+)/g, "$1_$2")
    .toLowerCase()
}
