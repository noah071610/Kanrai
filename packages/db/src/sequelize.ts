import type { DbColumn, DbTable } from "@kanrai/core"
import ts from "typescript"

import type { Reader } from "./reader.js"
import {
  Ref,
  createFileCache,
  decorators,
  evaluate,
  isObject,
  lineOf,
  propName,
  type Value,
  type ValueObject,
} from "./ts.js"

/**
 * Reads Sequelize models statically. Loading them at runtime is the hard part
 * (models/index.js auto-loaders, factories, a Sequelize instance and a dialect
 * package just to register a model), so this skips loading entirely and reads
 * the three shapes models are written in:
 *
 *   sequelize.define("User", { ...attributes }, { ...options })
 *   User.init({ ...attributes }, { sequelize, ...options })
 *   @Table class User extends Model { @Column ... }      (sequelize-typescript)
 *
 * ponytail: attributes built at runtime (spread helpers, loops) are invisible,
 * `underscored: true` column renaming is not applied, and plural table names
 * use a naive English rule. The model name is kept too, and `db:<name>`
 * matches either.
 */
export function sequelizeReader(root: string, include: string[], exclude: string[]): Reader {
  const sourceFiles = createFileCache(root, include, exclude, /\.define\s*\(|\.init\s*\(|@Table\b/)

  return {
    relevant: (relative) => /\.[cm]?[jt]sx?$/.test(relative),
    async read() {
      const tables: DbTable[] = []
      for (const { filePath, sf } of await sourceFiles()) {
        const visit = (node: ts.Node) => {
          const table = fromDefineOrInit(node, filePath, sf) ?? fromDecoratedClass(node, filePath, sf)
          if (table) tables.push(table)
          ts.forEachChild(node, visit)
        }
        visit(sf)
      }
      return { tables, diagnostics: [] }
    },
  }
}

function fromDefineOrInit(node: ts.Node, filePath: string, sf: ts.SourceFile): DbTable | null {
  if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)) return null
  const method = node.expression.name.text
  const args = node.arguments.map((a) => evaluate(a, sf))

  let model: string
  let attributes: Value | undefined
  let options: Value | undefined
  if (method === "define" && typeof args[0] === "string") {
    ;[model, attributes, options] = [args[0], args[1], args[2]]
  } else if (method === "init" && isObject(args[1]) && "sequelize" in args[1]) {
    options = args[1]
    attributes = args[0]
    model = typeof options.modelName === "string" ? options.modelName : node.expression.expression.getText(sf)
  } else {
    return null
  }
  if (!isObject(attributes)) return null

  const opts = isObject(options) ? options : {}
  const groups = new Map<string, string[]>()
  const columns = Object.entries(attributes).map(([key, value]) =>
    readAttribute(key, isObject(value) ? value : { type: value }, groups),
  )
  return finish(model, opts, columns, groups, filePath, lineOf(node, sf))
}

function fromDecoratedClass(node: ts.Node, filePath: string, sf: ts.SourceFile): DbTable | null {
  if (!ts.isClassDeclaration(node) || !node.name) return null
  const table = decorators(node, sf).find((d) => d.name === "Table")
  if (!table) return null

  const groups = new Map<string, string[]>()
  const columns: DbColumn[] = []
  for (const member of node.members) {
    if (!ts.isPropertyDeclaration(member)) continue
    const decs = decorators(member, sf)
    const column = decs.find((d) => d.name === "Column")
    if (!column) continue

    const [first] = column.args
    const attr: ValueObject = isObject(first) ? { ...first } : first !== undefined ? { type: first } : {}
    // Stand-alone decorators: @PrimaryKey @AllowNull(false) @Unique @Default(...)
    for (const d of decs) {
      if (d.name === "PrimaryKey") attr.primaryKey = true
      if (d.name === "AllowNull") attr.allowNull = d.args[0] ?? true
      if (d.name === "Unique") attr.unique = d.args[0] ?? true
    }
    if (attr.type === undefined && member.type) attr.type = member.type.getText(sf)
    columns.push(readAttribute(propName(member.name, sf), attr, groups))
  }

  const [options] = table.args
  return finish(node.name.text, isObject(options) ? options : {}, columns, groups, filePath, lineOf(node, sf))
}

function readAttribute(key: string, attr: ValueObject, groups: Map<string, string[]>): DbColumn {
  const name = typeof attr.field === "string" ? attr.field : key
  const type = attr.type instanceof Ref ? attr.type.last : typeof attr.type === "string" ? attr.type : "unknown"
  const primary = attr.primaryKey === true

  // unique: "group" → composite unique with the other columns in that group.
  if (typeof attr.unique === "string") {
    groups.set(attr.unique, [...(groups.get(attr.unique) ?? []), name])
  }
  const values = Array.isArray(attr.values)
    ? attr.values
    : attr.type instanceof Ref && type === "ENUM"
      ? attr.type.args
      : undefined

  return {
    name,
    type,
    nullable: !primary && attr.allowNull !== false,
    unique: primary || attr.unique === true || isObject(attr.unique),
    primary,
    ...(values ? { enumValues: values.map(String) } : {}),
  }
}

function finish(
  model: string,
  options: ValueObject,
  columns: DbColumn[],
  groups: Map<string, string[]>,
  filePath: string,
  line: number,
): DbTable {
  // Columns Sequelize adds unless told otherwise.
  if (!columns.some((c) => c.primary)) {
    columns.unshift({ name: "id", type: "INTEGER", nullable: false, unique: true, primary: true })
  }
  if (options.timestamps !== false) {
    for (const [key, name] of [
      ["createdAt", "createdAt"],
      ["updatedAt", "updatedAt"],
    ] as const) {
      if (options[key] === false) continue
      const column = typeof options[key] === "string" ? (options[key] as string) : name
      if (!columns.some((c) => c.name === column)) {
        columns.push({ name: column, type: "DATE", nullable: false, unique: false, primary: false })
      }
    }
    if (options.paranoid === true && !columns.some((c) => c.name === "deletedAt")) {
      columns.push({ name: "deletedAt", type: "DATE", nullable: true, unique: false, primary: false })
    }
  }

  for (const members of groups.values()) {
    if (members.length === 1) {
      const column = columns.find((c) => c.name === members[0])
      if (column) column.unique = true
    }
  }

  const name =
    typeof options.tableName === "string"
      ? options.tableName
      : options.freezeTableName === true
        ? model
        : pluralize(model)

  return {
    name,
    ...(name !== model ? { model } : {}),
    filePath,
    line,
    columns,
    uniques: [...groups.values()].filter((g) => g.length > 1),
  }
}

function pluralize(word: string): string {
  if (/[^aeiou]y$/i.test(word)) return `${word.slice(0, -1)}ies`
  if (/(s|x|z|ch|sh)$/i.test(word)) return `${word}es`
  return `${word}s`
}
