import type { DbOp, Diagnostic, FlowStep, HttpMethod, Layer } from "./types.js";

/**
 * Express / NestJS / Hono / Fastify / Django (DRF) / FastAPI naming. Singular
 * and plural both appear (`user.route.ts`, `routes/`), so both are listed.
 */
const LAYER_WORDS: Record<string, Layer> = {
  route: "route", routes: "route", router: "route", routers: "route",
  controller: "route", controllers: "route", handler: "route", handlers: "route",
  resolver: "route", resolvers: "route", endpoint: "route", endpoints: "route",
  view: "route", views: "route", viewset: "route", viewsets: "route",
  service: "service", services: "service", usecase: "service", usecases: "service",
  selector: "service", selectors: "service",
  repository: "repository", repositories: "repository", repo: "repository",
  repos: "repository", dao: "repository", daos: "repository", crud: "repository",
  managers: "repository", querysets: "repository", // ponytail: plural only — `session_manager.py` is not a repository
};

/**
 * File name first (`users.controller.ts`, `user-service.ts`, `userRepo.ts`),
 * then the nearest folder (`routes/users/index.ts` for Fastify autoload).
 * ponytail: `models/` skipped — Mongoose models vs Nest DTOs/entities are ambiguous.
 */
export function layerOf(filePath: string): Layer | undefined {
  const parts = filePath.split("/");
  const stem = parts.pop()!.replace(/\.[^.]+$/, "");
  const last = stem.split(/[.\-_]|(?<=[a-z0-9])(?=[A-Z])/).pop()!.toLowerCase();
  if (LAYER_WORDS[last]) return LAYER_WORDS[last];
  for (let i = parts.length - 1; i >= 0; i--) {
    const layer = LAYER_WORDS[parts[i]!.toLowerCase()];
    if (layer) return layer;
  }
  return undefined;
}

const METHODS = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
] as const;

/**
 * Matches a well-formed annotation. Deliberately permissive about the comment
 * marker so the same grammar works across languages:
 *
 *   // [POST: /api/example flow-1] description
 *   #  [POST: /api/example flow-1]: description
 *   *  [post: /api/example flow-10] description
 *   -- [GET: /api/users/:id flow-2] description
 *   // [POST: /api/orders flow-4 case:card db:orders:create] description
 */
const ANNOTATION =
  /(?:\/\/|\/\*|\*|#|--|<!--)?\s*\[\s*([A-Za-z]+)\s*:\s*(\S+)\s+flow-(\d+)((?:\s+[^\s\]]+)*)\s*\]\s*:?\s*(.*?)\s*(?:\*\/|-->)?\s*$/;

const DB_OPS: readonly DbOp[] = ["create", "read", "update", "delete"];

type StepTags = Pick<
  FlowStep,
  "kind" | "case" | "status" | "table" | "op" | "service"
>;

/**
 * Reads the tokens after `flow-N`. At most one kind token (`fail`, `branch`,
 * `db:`, `api:`) plus an optional `case:`. Returns an error message instead of
 * guessing — a misread tag draws a wrong graph silently.
 */
export function parseTags(raw: string): StepTags | string {
  const tags: StepTags = { kind: "step" };
  let kinds = 0;

  for (const token of raw.split(/\s+/).filter(Boolean)) {
    const [name, ...args] = token.split(":");

    if (name === "case") {
      if (args.length !== 1 || !args[0]) return `Expected \`case:<label>\`, got "${token}".`;
      if (tags.case) return "A step can only have one `case:` token.";
      tags.case = args[0];
      continue;
    }

    kinds++;
    if (kinds > 1) return `A step can only have one kind token; "${token}" is extra.`;

    if (name === "branch" && args.length === 0) {
      tags.kind = "branch";
    } else if (name === "fail" && args.length <= 1) {
      tags.kind = "fail";
      if (args.length === 1) {
        if (!/^\d{3}$/.test(args[0]!)) return `Expected \`fail:<status>\` with a 3-digit HTTP status, got "${token}".`;
        tags.status = Number(args[0]);
      }
    } else if (name === "db") {
      const [table, op] = args;
      if (args.length !== 2 || !table || !DB_OPS.includes(op as DbOp)) {
        return `Expected \`db:<table>:<create|read|update|delete>\`, got "${token}".`;
      }
      tags.kind = "db";
      tags.table = table;
      tags.op = op as DbOp;
    } else if (name === "api" && args.length === 1 && args[0]) {
      tags.kind = "api";
      tags.service = args[0];
    } else {
      return `Unknown step token "${token}". Allowed: case:<label>, branch, fail[:status], db:<table>:<op>, api:<service>.`;
    }
  }

  if (tags.kind === "branch" && tags.case) {
    return "Nested branches are not supported: a `branch` step cannot also have `case:`.";
  }
  return tags;
}

/**
 * Looks like someone tried to write an annotation. Used to surface `malformed`
 * diagnostics instead of silently dropping typos on the floor — a dropped
 * annotation is invisible, and invisible failures are what kill trust in a
 * tool like this.
 */
const NEAR_MISS = /\[\s*[A-Za-z]+\s*:.*flow[\s-]*\d*/i;

export interface ParseResult {
  steps: ParsedStep[];
  diagnostics: Diagnostic[];
}

/** A step before it has been grouped into a flow. */
export interface ParsedStep extends FlowStep {
  method: HttpMethod;
  endpoint: string;
}

function normalizeMethod(raw: string): HttpMethod | null {
  const upper = raw.toUpperCase();
  return (METHODS as readonly string[]).includes(upper)
    ? (upper as HttpMethod)
    : null;
}

/**
 * Parse one file's contents. `filePath` should already be relative to the
 * project root and POSIX-style — the parser does not touch the filesystem.
 */
export function parseSource(filePath: string, source: string): ParseResult {
  const steps: ParsedStep[] = [];
  const diagnostics: Diagnostic[] = [];
  const lines = source.split(/\r?\n/);
  const layer = layerOf(filePath);

  for (let i = 0; i < lines.length; i++) {
    const text = lines[i];
    if (text === undefined) continue;
    if (!text.includes("[")) continue;

    const match = ANNOTATION.exec(text);
    const line = i + 1;

    if (!match) {
      if (NEAR_MISS.test(text)) {
        diagnostics.push({
          code: "malformed",
          severity: "warning",
          message:
            "Looks like a flow annotation but does not match `[METHOD: /path flow-N] description`.",
          filePath,
          line,
          column: Math.max(1, text.indexOf("[") + 1),
        });
      }
      continue;
    }

    const [
      ,
      rawMethod = "",
      endpoint = "",
      rawOrder = "",
      rawTags = "",
      description = "",
    ] = match;
    const method = normalizeMethod(rawMethod);

    if (!method) {
      diagnostics.push({
        code: "malformed",
        severity: "warning",
        message: `Unknown HTTP method "${rawMethod}".`,
        filePath,
        line,
        column: Math.max(1, text.indexOf("[") + 1),
      });
      continue;
    }

    const order = Number.parseInt(rawOrder, 10);
    if (!Number.isFinite(order) || order < 0) {
      diagnostics.push({
        code: "malformed",
        severity: "warning",
        message: `flow-${rawOrder} is not a valid step number (must be 0 or greater).`,
        filePath,
        line,
        column: Math.max(1, text.indexOf("[") + 1),
      });
      continue;
    }

    // flow-0 is a client call site: it only says who sends the request.
    const tags = order === 0 && rawTags.trim() ? "flow-0 marks a client call and takes no tags." : parseTags(rawTags);
    if (typeof tags === "string") {
      diagnostics.push({
        code: "malformed",
        severity: "warning",
        message: tags,
        filePath,
        line,
        column: Math.max(1, text.indexOf("[") + 1),
      });
      continue;
    }

    steps.push({
      method,
      endpoint,
      order,
      ...tags,
      description: description.trim(),
      filePath,
      ...(layer && { layer }),
      line,
      column: Math.max(1, text.indexOf("[") + 1),
      raw: text.trim(),
    });
  }

  return { steps, diagnostics };
}

/** The canonical id for a flow. Keep this the only place it is constructed. */
export function flowId(method: HttpMethod, endpoint: string): string {
  return `${method} ${endpoint}`;
}
