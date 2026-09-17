import { isRegular, owningBranch } from "./graph.js";
import type { Diagnostic, Flow, FlowStep } from "./types.js";

/**
 * Structural checks over the assembled flows.
 *
 * This lives in core, not in the VS Code extension, on purpose: the extension
 * is optional, and validation that only runs for people who installed the
 * extension is validation most users never see.
 */
export function validateFlows(flows: Flow[]): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  for (const flow of flows) {
    const at = (step: FlowStep | undefined) =>
      step
        ? { filePath: step.filePath, line: step.line, column: step.column }
        : {};
    const report = (
      code: Diagnostic["code"],
      message: string,
      step?: FlowStep,
      severity: Diagnostic["severity"] = "error",
    ) =>
      diagnostics.push({ code, severity, message, ...at(step), flowId: flow.id });

    // flow-0 client calls sit outside the numbering: many are allowed.
    const callers = flow.steps.filter((s) => s.order === 0);
    const regular = flow.steps.filter((s) => isRegular(s) && s.order > 0);

    // Lanes: the main line, and one per (branch, case) arm. Two arms of
    // different branches may reuse a label, so the branch is part of the key.
    const lanes = new Map<string, FlowStep[]>();
    for (const step of regular) {
      let key = "main";
      if (step.case !== undefined) {
        const owner = owningBranch(flow, step);
        if (owner === undefined) {
          report(
            "orphan-case",
            `case:${step.case} flow-${step.order} of ${flow.id} has no \`branch\` step before it.`,
            step,
          );
          continue;
        }
        key = `${owner}:${step.case}`;
      }
      const lane = lanes.get(key);
      if (lane) lane.push(step);
      else lanes.set(key, [step]);
    }

    // Duplicates: same flow-N twice in one lane, or a main-line number that an
    // arm already uses.
    const mainOrders = new Set((lanes.get("main") ?? []).map((s) => s.order));
    for (const [key, lane] of lanes) {
      const byOrder = new Map<number, FlowStep[]>();
      for (const step of lane) {
        const bucket = byOrder.get(step.order);
        if (bucket) bucket.push(step);
        else byOrder.set(step.order, [step]);
      }
      const where = key === "main" ? "" : ` in case:${lane[0]!.case}`;
      for (const [order, steps] of byOrder) {
        if (steps.length > 1) {
          for (const step of steps) {
            report("duplicate", `flow-${order}${where} is declared ${steps.length} times for ${flow.id}.`, step);
          }
        }
        if (key !== "main" && mainOrders.has(order)) {
          report("duplicate", `flow-${order} is used both on the main line and${where} for ${flow.id}.`, steps[0]);
        }
      }

      // Arms number on from their branch without holes.
      if (key !== "main") {
        const branch = Number(key.slice(0, key.indexOf(":")));
        const orders = [...byOrder.keys()].sort((a, b) => a - b);
        for (let i = 0; i < orders.length; i++) {
          const expected = i === 0 ? branch + 1 : orders[i - 1]! + 1;
          if (orders[i] !== expected) {
            report(
              "gap",
              `case:${lane[0]!.case} of ${flow.id} should continue at flow-${expected}, found flow-${orders[i]}.`,
              byOrder.get(orders[i]!)![0],
            );
            break;
          }
        }
      }
    }

    // Branch without arms.
    for (const step of regular) {
      if (step.kind !== "branch") continue;
      const hasArm = regular.some(
        (s) => s.case !== undefined && owningBranch(flow, s) === step.order,
      );
      if (!hasArm) {
        report("empty-branch", `branch flow-${step.order} of ${flow.id} has no \`case:\` steps after it.`, step);
      }
    }

    // Fails must exit from a real step.
    for (const step of flow.steps) {
      if (step.kind !== "fail") continue;
      const parent = regular.some(
        (s) => s.order === step.order && s.case === step.case,
      );
      const armHead =
        step.case !== undefined && owningBranch(flow, step) === step.order - 1;
      if (!parent && !armHead) {
        const where = step.case === undefined ? "" : ` in case:${step.case}`;
        report("dangling-fail", `fail flow-${step.order}${where} of ${flow.id} has no regular flow-${step.order}${where} to exit from.`, step);
      }
    }

    const orders = [...new Set(regular.map((s) => s.order))].sort((a, b) => a - b);
    const first = orders[0];
    const last = orders[orders.length - 1];

    // No entry point.
    if (callers.length === flow.steps.length) {
      for (const caller of callers) {
        report(
          "no-entry",
          `${flow.id} is called here but no backend flow-1 exists — wrong path, or the handler is not annotated.`,
          caller,
          "warning",
        );
      }
    } else if (first !== 1) {
      report(
        "no-entry",
        first === undefined
          ? `${flow.id} has only fail steps — flow-1 is missing.`
          : `${flow.id} starts at flow-${first} — flow-1 is missing.`,
        regular[0] ?? flow.steps[0],
      );
    }

    // Gaps across the main line and all arms together.
    if (first !== undefined && last !== undefined) {
      for (let n = Math.max(1, first); n < last; n++) {
        if (orders.includes(n)) continue;
        report(
          "gap",
          `${flow.id} jumps over flow-${n} (found up to flow-${last}).`,
          regular.find((s) => s.order > n),
        );
      }
    }

    // Single-step flow — usually an abandoned trace rather than a real one.
    if (regular.length === 1) {
      report(
        "orphan",
        `${flow.id} has only one step. Was the rest of the trace left unannotated?`,
        regular[0],
        "warning",
      );
    }
  }

  return diagnostics;
}

export function countBySeverity(diagnostics: Diagnostic[]) {
  return {
    error: diagnostics.filter((d) => d.severity === "error").length,
    warning: diagnostics.filter((d) => d.severity === "warning").length,
    info: diagnostics.filter((d) => d.severity === "info").length,
  };
}
