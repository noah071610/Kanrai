import * as path from "node:path";
import * as vscode from "vscode";
import {
  findTable,
  flowId,
  loadConfig,
  nextSteps,
  parseSource,
  watchProject,
  type KanraiConfig,
  type DbSchema,
  type Diagnostic,
  type FlowIndex,
  type WatchHandle,
} from "@kanrai/core";
import { watchDb } from "@kanrai/db";

/**
 * The extension is an optional convenience layer. It does no parsing and no
 * validation of its own — it renders what core produces, so a user without the
 * extension sees the same errors via the CLI.
 */

let handle: WatchHandle | null = null;
let index: FlowIndex | null = null;
let db: DbSchema | null = null;
let config: KanraiConfig | null = null;
let root: string | null = null;
type AnnotationKind = "default" | "api" | "db" | "fail" | "case";

let annotationDecorations = new Map<
  AnnotationKind,
  vscode.TextEditorDecorationType
>();

const collection = vscode.languages.createDiagnosticCollection("kanrai");
const FLOW_ANNOTATION =
  /\[\s*(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s*:\s*\/[^\s\]]+\s+flow-\d+(?:\s+(?:branch|fail|(?:db|fail|api|case):[^\s\]]+))*\s*\]/;
const ANNOTATION_KINDS: readonly AnnotationKind[] = [
  "default",
  "api",
  "db",
  "fail",
  "case",
];

export async function activate(context: vscode.ExtensionContext) {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) return;

  root = folder.uri.fsPath;
  config = await loadConfig(root);

  // The extension runs the ORM readers itself and keeps db.json current, so a
  // project that never runs the CLI (e.g. a Python one without Node) still
  // gets DB hovers and a db.json for the viewer. Not awaited: the first read
  // (Drizzle, a large Python project) must not hold up activation.
  void watchDb({
    root,
    config,
    onUpdate: (schema) => {
      db = schema;
    },
    onError: (error) => console.error("[kanrai] db", error),
  }).then((dbHandle) => {
    db = dbHandle.current();
    context.subscriptions.push({ dispose: () => void dbHandle.close() });
  });

  context.subscriptions.push(
    collection,
    { dispose: () => annotationDecorations.forEach((decoration) => decoration.dispose()) },
    vscode.window.onDidChangeVisibleTextEditors(refreshAnnotationDecorations),
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (
        vscode.window.visibleTextEditors.some(
          (editor) => editor.document === event.document,
        )
      ) {
        refreshAnnotationDecorations();
      }
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (
        event.affectsConfiguration("kanrai.annotationForeground") ||
        event.affectsConfiguration("kanrai.annotationBackground") ||
        event.affectsConfiguration("kanrai.annotationApiForeground") ||
        event.affectsConfiguration("kanrai.annotationApiBackground") ||
        event.affectsConfiguration("kanrai.annotationDbForeground") ||
        event.affectsConfiguration("kanrai.annotationDbBackground") ||
        event.affectsConfiguration("kanrai.annotationFailForeground") ||
        event.affectsConfiguration("kanrai.annotationFailBackground") ||
        event.affectsConfiguration("kanrai.annotationCaseForeground") ||
        event.affectsConfiguration("kanrai.annotationCaseBackground")
      ) {
        createAnnotationDecoration();
      }
    }),
    vscode.languages.registerDefinitionProvider(
      { scheme: "file" },
      new FlowDefinitionProvider(),
    ),
    vscode.languages.registerHoverProvider(
      { scheme: "file" },
      new DbHoverProvider(),
    ),
    vscode.commands.registerCommand("kanrai.rescan", async () => {
      await handle?.rescan();
      vscode.window.showInformationMessage("kanrai: rescanned.");
    }),
    vscode.commands.registerCommand("kanrai.openViewer", () => {
      vscode.env.openExternal(vscode.Uri.parse("http://localhost:4477"));
    }),
  );

  createAnnotationDecoration();

  handle = await watchProject({
    root,
    config,
    onUpdate: (next) => {
      index = next;
      publishDiagnostics(next);
    },
    onError: (error) => console.error("[kanrai]", error),
  });

  index = handle.current();
  if (index) publishDiagnostics(index);

  context.subscriptions.push({ dispose: () => void handle?.close() });
}

export function deactivate() {
  void handle?.close();
}

function createAnnotationDecoration() {
  annotationDecorations.forEach((decoration) => decoration.dispose());
  annotationDecorations.clear();

  const settings = vscode.workspace.getConfiguration("kanrai");
  for (const kind of ANNOTATION_KINDS) {
    const suffix = kind === "default" ? "" : `${kind.charAt(0).toUpperCase()}${kind.slice(1)}`;
    annotationDecorations.set(
      kind,
      vscode.window.createTextEditorDecorationType({
        color: settings.get<string>(`annotation${suffix}Foreground`),
        backgroundColor: settings.get<string>(`annotation${suffix}Background`),
        borderRadius: "2px",
      }),
    );
  }
  refreshAnnotationDecorations();
}

function refreshAnnotationDecorations() {
  if (!annotationDecorations.size) return;

  for (const editor of vscode.window.visibleTextEditors) {
    const ranges = new Map<AnnotationKind, vscode.Range[]>(
      ANNOTATION_KINDS.map((kind) => [kind, []]),
    );
    for (let line = 0; line < editor.document.lineCount; line++) {
      const text = editor.document.lineAt(line).text;
      const annotation = text.match(FLOW_ANNOTATION)?.[0];
      if (!annotation) continue;
      ranges.get(annotationKind(annotation))?.push(editor.document.lineAt(line).range);
    }
    for (const [kind, decoration] of annotationDecorations) {
      editor.setDecorations(decoration, ranges.get(kind) ?? []);
    }
  }
}

function annotationKind(annotation: string): AnnotationKind {
  if (/\s+fail(?::[^\s\]]+)?(?=\s|\])/.test(annotation)) return "fail";
  if (/\s+api:[^\s\]]+/.test(annotation)) return "api";
  if (/\s+db:[^\s\]]+/.test(annotation)) return "db";
  if (/\s+case:[^\s\]]+/.test(annotation)) return "case";
  return "default";
}

/** Mirrors core's diagnostics into the Problems panel. */
function publishDiagnostics(next: FlowIndex) {
  if (!root) return;
  const byFile = new Map<string, vscode.Diagnostic[]>();

  for (const d of next.diagnostics) {
    if (!d.filePath) continue;
    const absolute = path.join(root, d.filePath);
    const line = Math.max(0, (d.line ?? 1) - 1);
    const column = Math.max(0, (d.column ?? 1) - 1);
    const range = new vscode.Range(line, column, line, column + 80);

    const diagnostic = new vscode.Diagnostic(
      range,
      d.message,
      toSeverity(d.severity),
    );
    diagnostic.source = "kanrai";
    diagnostic.code = d.code;

    const bucket = byFile.get(absolute);
    if (bucket) bucket.push(diagnostic);
    else byFile.set(absolute, [diagnostic]);
  }

  collection.clear();
  for (const [file, diagnostics] of byFile) {
    collection.set(vscode.Uri.file(file), diagnostics);
  }
}

function toSeverity(severity: Diagnostic["severity"]) {
  if (severity === "error") return vscode.DiagnosticSeverity.Error;
  if (severity === "warning") return vscode.DiagnosticSeverity.Warning;
  return vscode.DiagnosticSeverity.Information;
}

/**
 * Cmd/Ctrl+click on any annotation jumps to what comes next. When there is
 * more than one next step (a branch, or fails beside the next step) VS Code
 * shows them all in a peek list.
 */
class FlowDefinitionProvider implements vscode.DefinitionProvider {
  provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): vscode.Location[] | undefined {
    if (!index || !root) return undefined;

    const lineText = document.lineAt(position.line).text;
    const start = lineText.indexOf("[");
    const end = lineText.indexOf("]", start);
    if (start < 0 || end < 0) return undefined;
    if (position.character < start || position.character > end) return undefined;

    const relative = path
      .relative(root, document.uri.fsPath)
      .split(path.sep)
      .join("/");
    const [step] = parseSource(relative, lineText).steps;
    if (!step) return undefined;

    const flow = index.flows.find(
      (f) => f.id === flowId(step.method, step.endpoint),
    );
    // The indexed copy of this step, matched by position — the one parsed
    // from the live line has no place in the flow yet.
    const current = flow?.steps.find(
      (s) => s.filePath === relative && s.line === position.line + 1,
    );
    if (!flow || !current) return undefined;

    return nextSteps(flow, current).map((s) =>
      location(s.filePath, s.line, s.column),
    );
  }
}

/** Shows the matching model without changing Cmd/Ctrl+click navigation. */
class DbHoverProvider implements vscode.HoverProvider {
  provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): vscode.Hover | undefined {
    if (!db || !root) return undefined;

    const lineText = document.lineAt(position.line).text;
    const relative = path.relative(root, document.uri.fsPath).split(path.sep).join("/");
    const [step] = parseSource(relative, lineText).steps;
    if (!step?.table) return undefined;

    const dbToken = `db:${step.table}:${step.op}`;
    const token = lineText.indexOf(dbToken);
    if (token < 0 || position.character < token || position.character >= token + dbToken.length) {
      return undefined;
    }

    const table = findTable(db, step.table);
    if (!table) return undefined;

    const schema = new vscode.MarkdownString();
    schema.appendMarkdown(`**${table.model ?? table.name}**  \`${table.name}\`\n\n`);
    schema.appendCodeblock(
      table.columns
        .map((column) => `${column.primary ? "PK " : "   "}${column.name}: ${column.type}${column.nullable ? "?" : ""}${column.unique && !column.primary ? " (unique)" : ""}`)
        .join("\n"),
    );
    return new vscode.Hover(
      schema,
      new vscode.Range(position.line, token, position.line, token + dbToken.length),
    );
  }
}

function location(filePath: string, line: number, column: number) {
  return new vscode.Location(
    vscode.Uri.file(path.join(root!, filePath)),
    new vscode.Position(Math.max(0, line - 1), Math.max(0, column - 1)),
  );
}
