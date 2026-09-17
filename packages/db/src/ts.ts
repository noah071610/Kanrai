import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import fg from "fast-glob";
import ts from "typescript";

/**
 * Static reading of TS/JS model files with the compiler's parser only — no
 * Program, no type checker, no running user code. Each file parses on its own,
 * so a save re-parses one file instead of the project.
 */

/** A syntax-level value: literals are plain, anything else is a `Ref`. */
export type Value = string | number | boolean | null | Value[] | ValueObject | Ref;
export interface ValueObject {
  [key: string]: Value;
}
export class Ref {
  constructor(
    /** Source text of the identifier / property access / callee. */
    readonly text: string,
    /** Call arguments, when the expression was a call. */
    readonly args: Value[] = [],
  ) {}
  /** `DataTypes.STRING` → `STRING` */
  get last(): string {
    return this.text.split(".").pop() ?? this.text;
  }
}

export function evaluate(node: ts.Node | undefined, sf: ts.SourceFile): Value {
  if (!node) return null;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isNumericLiteral(node)) return Number(node.text);
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (node.kind === ts.SyntaxKind.NullKeyword) return null;
  if (ts.isAsExpression(node) || ts.isParenthesizedExpression(node) || ts.isSatisfiesExpression(node)) {
    return evaluate(node.expression, sf);
  }
  if (ts.isArrayLiteralExpression(node)) return node.elements.map((e) => evaluate(e, sf));
  if (ts.isObjectLiteralExpression(node)) {
    const out: ValueObject = {};
    for (const p of node.properties) {
      if (ts.isPropertyAssignment(p) && p.name) out[propName(p.name, sf)] = evaluate(p.initializer, sf);
      else if (ts.isShorthandPropertyAssignment(p)) out[p.name.text] = new Ref(p.name.text);
    }
    return out;
  }
  if (ts.isCallExpression(node)) {
    return new Ref(node.expression.getText(sf), node.arguments.map((a) => evaluate(a, sf)));
  }
  return new Ref(node.getText(sf));
}

export function propName(name: ts.PropertyName, sf: ts.SourceFile): string {
  return ts.isIdentifier(name) || ts.isStringLiteral(name) ? name.text : name.getText(sf);
}

export function isObject(v: Value | undefined): v is ValueObject {
  return !!v && typeof v === "object" && !Array.isArray(v) && !(v instanceof Ref);
}

export interface Decorator {
  name: string;
  args: Value[];
}

export function decorators(node: ts.Node, sf: ts.SourceFile): Decorator[] {
  if (!ts.canHaveDecorators(node)) return [];
  return (ts.getDecorators(node) ?? []).map((d) => {
    const v = evaluate(d.expression, sf);
    return v instanceof Ref ? { name: v.last, args: v.args } : { name: "", args: [] };
  });
}

export function lineOf(node: ts.Node, sf: ts.SourceFile): number {
  return sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
}

/** `enum Role { A = "a", B }` → `Role → ["a", "B"]` */
export function collectEnums(sf: ts.SourceFile, into: Map<string, string[]>) {
  const visit = (node: ts.Node) => {
    if (ts.isEnumDeclaration(node)) {
      into.set(
        node.name.text,
        node.members.map((m) => {
          const v = evaluate(m.initializer, sf);
          return typeof v === "string" || typeof v === "number" ? String(v) : propName(m.name, sf);
        }),
      );
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

/**
 * Parses every included file whose text matches `interesting`, reusing the
 * previous parse when the mtime has not moved.
 *
 * ponytail: stats every included file per run, fine to a few thousand files;
 * feed changed paths from the watcher if that ever shows up in a profile.
 */
export function createFileCache(
  root: string,
  include: string[],
  exclude: string[],
  interesting: RegExp,
) {
  const cache = new Map<string, { mtime: number; sf: ts.SourceFile | null }>();

  return async function sourceFiles(): Promise<{ filePath: string; sf: ts.SourceFile }[]> {
    const files = await fg(include, { cwd: root, ignore: exclude, onlyFiles: true });
    const seen = new Set(files);
    for (const key of cache.keys()) if (!seen.has(key)) cache.delete(key);

    const out: { filePath: string; sf: ts.SourceFile }[] = [];
    for (const filePath of files.sort()) {
      if (!/\.[cm]?[jt]sx?$/.test(filePath)) continue;
      const absolute = path.join(root, filePath);
      let mtime: number;
      try {
        mtime = (await stat(absolute)).mtimeMs;
      } catch {
        continue;
      }
      let entry = cache.get(filePath);
      if (!entry || entry.mtime !== mtime) {
        const text = await readFile(absolute, "utf8").catch(() => "");
        entry = {
          mtime,
          sf: interesting.test(text)
            ? ts.createSourceFile(filePath, text, ts.ScriptTarget.Latest, true)
            : null,
        };
        cache.set(filePath, entry);
      }
      if (entry.sf) out.push({ filePath, sf: entry.sf });
    }
    return out;
  };
}
