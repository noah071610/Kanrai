import type { Flow, FlowStep } from "./types.js";

/**
 * How steps connect. One place for the branch rules so the validator, the
 * editor jump and the viewer graph can never disagree about what "next" means.
 *
 * - `fail` steps hang off the regular step with the same number and case. An
 *   arm whose first step is only a fail hangs it straight off the branch.
 * - A `case:` step belongs to the nearest `branch` before it. Each arm numbers
 *   on from `branch + 1`; after the last arm step the flow resumes at the next
 *   main-line step (no case).
 * - Branches do not nest.
 * - `flow-0` steps are client call sites; each one leads to flow-1 (N:1).
 */

export function isRegular(step: FlowStep): boolean {
  return step.kind !== "fail";
}

/** The order of the `branch` step a `case:` step belongs to, if any. */
export function owningBranch(flow: Flow, step: FlowStep): number | undefined {
  if (step.case === undefined) return undefined;
  let owner: number | undefined;
  for (const s of flow.steps) {
    if (s.kind === "branch" && s.order < step.order) {
      if (owner === undefined || s.order > owner) owner = s.order;
    }
  }
  return owner;
}

export function nextSteps(flow: Flow, step: FlowStep): FlowStep[] {
  if (step.kind === "fail") return [];

  const fails = flow.steps.filter(
    (s) => s.kind === "fail" && s.order === step.order && s.case === step.case,
  );
  const regular = flow.steps.filter(isRegular);

  if (step.kind === "branch") {
    // An arm may be nothing but a fail (e.g. `default` → ignored), so arm
    // heads include fails with no regular step beside them.
    const heads = flow.steps.filter(
      (s) =>
        s.case !== undefined &&
        s.order === step.order + 1 &&
        owningBranch(flow, s) === step.order &&
        (isRegular(s) ||
          !regular.some((r) => r.order === s.order && r.case === s.case)),
    );
    return [...heads, ...fails];
  }

  const next = regular.find(
    (s) => s.order === step.order + 1 && s.case === step.case,
  );
  if (next) return [next, ...fails];

  if (step.case !== undefined) {
    // End of an arm: rejoin the main line.
    const merge = regular
      .filter((s) => s.case === undefined && s.order > step.order)
      .sort((a, b) => a.order - b.order)[0];
    if (merge) return [merge, ...fails];
  }

  return fails;
}

export interface FlowEdge {
  flowId: string;
  from: FlowStep;
  to: FlowStep;
}

/** Every edge of every flow — the graph the viewer draws. */
export function flowEdges(flows: Flow[]): FlowEdge[] {
  return flows.flatMap((flow) =>
    flow.steps.flatMap((from) =>
      nextSteps(flow, from).map((to) => ({ flowId: flow.id, from, to })),
    ),
  );
}

/** A step's id within its flow. `order` alone is not unique once fails and arms share numbers. */
export function stepKey(step: FlowStep): string {
  return step.filePath === "" ? `missing:${step.case ?? ""}:${step.order}` : `${step.filePath}:${step.line}`;
}

/** A number the flow skips, drawn as a placeholder node so the gap is visible. */
export interface MissingStep {
  key: string;
  order: number;
  case?: string;
}

export interface FlowGraph {
  missing: MissingStep[];
  /** Step keys (`stepKey`), including placeholder keys. */
  edges: { from: string; to: string }[];
}

/**
 * The graph the viewer draws: every edge from `nextSteps`, with a placeholder
 * standing in for each skipped number so `flow-2 → [flow-3 missing] → flow-4`
 * stays connected instead of splitting into two islands.
 */
export function flowGraph(flow: Flow): FlowGraph {
  const placeholders: FlowStep[] = [];
  const add = (order: number, kase?: string) =>
    placeholders.push({
      order,
      kind: "step",
      ...(kase === undefined ? {} : { case: kase }),
      description: "",
      filePath: "",
      line: 0,
      column: 0,
      raw: "",
    });

  // Holes inside an arm first, so the same number is not also claimed as a
  // main-line hole below. Fail-only arm heads count as present.
  const taken = new Set(flow.steps.filter(isRegular).map((s) => s.order));
  const lanes = new Map<string, { branch: number; case: string; orders: Set<number> }>();
  for (const step of flow.steps) {
    if (step.case === undefined) continue;
    const branch = owningBranch(flow, step);
    if (branch === undefined) continue;
    const id = `${branch}:${step.case}`;
    const lane = lanes.get(id) ?? { branch, case: step.case, orders: new Set<number>() };
    lane.orders.add(step.order);
    lanes.set(id, lane);
  }
  for (const lane of lanes.values()) {
    const last = Math.max(...lane.orders);
    for (let n = lane.branch + 1; n < last; n++) {
      if (!lane.orders.has(n)) {
        add(n, lane.case);
        taken.add(n);
      }
    }
  }

  const last = Math.max(0, ...taken);
  for (let n = 1; n < last; n++) if (!taken.has(n)) add(n);

  const full: Flow = { ...flow, steps: [...flow.steps, ...placeholders] };
  return {
    missing: placeholders.map((p) => ({
      key: stepKey(p),
      order: p.order,
      ...(p.case === undefined ? {} : { case: p.case }),
    })),
    edges: full.steps.flatMap((from) =>
      nextSteps(full, from).map((to) => ({ from: stepKey(from), to: stepKey(to) })),
    ),
  };
}
