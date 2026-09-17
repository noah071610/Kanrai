import { MarkerType, type Edge, type Node } from "@xyflow/react";

import {
  findTable,
  type DbPayload,
  type DbTable,
  type Diagnostic,
  type Flow,
  type FlowStep,
  type FlowsPayload,
} from "../api";

/**
 * How a node looks. Derived from `kind`, plus where the node sits:
 * the entry (`flow-1`) and a regular step nothing follows get their own look,
 * and a skipped number is drawn as a `missing` placeholder. `flow-0` is a
 * frontend call site (`client`); a flow can have many.
 */
export type Variant =
  | "client"
  | "start"
  | "step"
  | "end"
  | "branch"
  | "fail"
  | "soft-fail"
  | "db"
  | "api"
  | "missing";

export type StepNodeData = {
  flowId: string;
  variant: Variant;
  order: number;
  case?: string;
  /** Absent for `missing` placeholders. */
  step?: FlowStep;
  uri?: string;
  table?: DbTable;
  diagnostics: Diagnostic[];
  isStart: boolean;
  isEnd: boolean;
};

export type StepNode = Node<StepNodeData, "step">;

export const DEFAULT_SIZE: Record<Variant, { width: number; height: number }> = {
  client: { width: 220, height: 76 },
  start: { width: 220, height: 76 },
  step: { width: 220, height: 76 },
  end: { width: 220, height: 76 },
  branch: { width: 190, height: 120 },
  fail: { width: 190, height: 76 },
  "soft-fail": { width: 190, height: 76 },
  db: { width: 190, height: 110 },
  api: { width: 220, height: 82 },
  missing: { width: 190, height: 64 },
};

export const isSoftFail = (step: FlowStep | undefined) =>
  step?.kind === "fail" && step.status !== undefined && step.status < 300;

function variantOf(step: FlowStep, isStart: boolean, isEnd: boolean): Variant {
  if (step.order === 0) return "client";
  if (step.kind === "fail") return isSoftFail(step) ? "soft-fail" : "fail";
  if (step.kind !== "step") return step.kind;
  if (isStart) return "start";
  if (isEnd) return "end";
  return "step";
}

/** Nodes (not yet positioned) and edges for one flow. */
export function buildGraph(
  flow: Flow,
  payload: FlowsPayload,
  db: DbPayload | null,
): { nodes: StepNode[]; edges: Edge[] } {
  const graphEdges = payload.edges.filter((e) => e.flowId === flow.id);
  const uris = new Map(
    payload.links.filter((l) => l.flowId === flow.id).map((l) => [l.step, l.uri]),
  );
  const diagnosticsAt = (step: FlowStep) =>
    payload.diagnostics.filter(
      (d) => d.flowId === flow.id && d.filePath === step.filePath && d.line === step.line,
    );

  // A node "ends" the flow when nothing but fails comes after it.
  const failKeys = new Set(
    flow.steps.filter((s) => s.kind === "fail").map((s) => `${s.filePath}:${s.line}`),
  );
  const continues = new Set(
    graphEdges.filter((e) => !failKeys.has(e.to)).map((e) => e.from),
  );

  const nodes: StepNode[] = [];

  for (const step of flow.steps) {
    const id = `${step.filePath}:${step.line}`;
    const isFail = step.kind === "fail";
    const isStart = !isFail && step.order === 1 && step.case === undefined;
    const isEnd = !isFail && !continues.has(id);
    const variant = variantOf(step, isStart, isEnd);
    nodes.push({
      id,
      type: "step",
      position: { x: 0, y: 0 },
      ...DEFAULT_SIZE[variant],
      data: {
        flowId: flow.id,
        variant,
        order: step.order,
        ...(step.case === undefined ? {} : { case: step.case }),
        step,
        uri: uris.get(id),
        table: step.kind === "db" ? findTable(db, step.table) : undefined,
        diagnostics: diagnosticsAt(step),
        isStart,
        isEnd,
      },
    });
  }

  for (const missing of payload.missing.filter((m) => m.flowId === flow.id)) {
    nodes.push({
      id: missing.key,
      type: "step",
      position: { x: 0, y: 0 },
      ...DEFAULT_SIZE.missing,
      data: {
        flowId: flow.id,
        variant: "missing",
        order: missing.order,
        ...(missing.case === undefined ? {} : { case: missing.case }),
        diagnostics: [],
        isStart: missing.order === 1 && missing.case === undefined,
        isEnd: false,
      },
    });
  }

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const edges: Edge[] = graphEdges.map(({ from, to }) => {
    const source = byId.get(from)?.data;
    const target = byId.get(to)?.data;
    const dashed =
      target?.variant === "fail" ||
      target?.variant === "soft-fail" ||
      target?.variant === "missing" ||
      source?.variant === "missing";
    const color =
      target?.variant === "fail" ? "#f43f5e" : target?.variant === "soft-fail" ? "#f59e0b" : "#a3a3a3";

    return {
      id: `${from}->${to}`,
      source: from,
      target: to,
      type: "smoothstep",
      // Down the main line; fails leave sideways to sit beside their step. A
      // fail that is a whole branch arm (`default` → ignored) stays vertical.
      ...((target?.variant === "fail" || target?.variant === "soft-fail") && source?.variant !== "branch"
        ? { sourceHandle: "right", targetHandle: "left" }
        : { sourceHandle: "bottom", targetHandle: "top" }),
      style: { stroke: color, strokeWidth: 1.5, ...(dashed ? { strokeDasharray: "6 5" } : {}) },
      markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color },
      ...(source?.variant === "branch" && target?.case
        ? {
            label: target.case,
            labelBgPadding: [6, 3] as [number, number],
            labelBgBorderRadius: 6,
            labelStyle: { fontFamily: "var(--font-mono)", fontSize: 11 },
          }
        : {}),
    };
  });

  return { nodes, edges };
}
