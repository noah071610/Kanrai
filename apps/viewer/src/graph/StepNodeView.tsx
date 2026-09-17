import { memo } from "react";
import { Handle, NodeResizer, Position, type NodeProps } from "@xyflow/react";
import { cn } from "@/lib/utils";

import { savePlacement } from "./layout";
import type { StepNode, Variant } from "./model";

type Shape = "pill" | "rect" | "diamond" | "cylinder" | "parallelogram";

/**
 * One look per variant. Shapes are SVG stretched to the node box (with
 * non-scaling strokes), so resizing never distorts line weight.
 */
const LOOK: Record<Variant, { shape: Shape; svg: string; box?: string; text: string; label: string }> = {
  client: {
    shape: "rect",
    box: "bg-teal-50 border-teal-500 dark:bg-teal-950 dark:border-teal-400",
    svg: "fill-teal-50 stroke-teal-500 dark:fill-teal-950 dark:stroke-teal-400",
    text: "text-teal-950 dark:text-teal-50",
    label: "client call",
  },
  start: {
    shape: "pill",
    box: "bg-emerald-50 border-emerald-500 dark:bg-emerald-950 dark:border-emerald-400",
    svg: "fill-emerald-50 stroke-emerald-500 dark:fill-emerald-950 dark:stroke-emerald-400",
    text: "text-emerald-950 dark:text-emerald-50",
    label: "entry",
  },
  step: {
    shape: "pill",
    box: "bg-white border-neutral-300 dark:bg-neutral-900 dark:border-neutral-600",
    svg: "fill-white stroke-neutral-300 dark:fill-neutral-900 dark:stroke-neutral-600",
    text: "text-neutral-900 dark:text-neutral-100",
    label: "step",
  },
  end: {
    shape: "pill",
    box: "bg-emerald-50 border-emerald-500 dark:bg-emerald-950 dark:border-emerald-400",
    svg: "fill-emerald-50 stroke-emerald-500 dark:fill-emerald-950 dark:stroke-emerald-400",
    text: "text-emerald-950 dark:text-emerald-50",
    label: "end",
  },
  branch: {
    shape: "diamond",
    svg: "fill-violet-50 stroke-violet-500 dark:fill-violet-950 dark:stroke-violet-400",
    text: "text-violet-950 dark:text-violet-50",
    label: "branch",
  },
  fail: {
    shape: "rect",
    box: "bg-rose-50 border-rose-500 dark:bg-rose-950 dark:border-rose-400",
    svg: "fill-rose-50 stroke-rose-500 dark:fill-rose-950 dark:stroke-rose-400",
    text: "text-rose-950 dark:text-rose-50",
    label: "fail",
  },
  "soft-fail": {
    shape: "rect",
    box: "bg-amber-50 border-amber-500 dark:bg-amber-950 dark:border-amber-400",
    svg: "fill-amber-50 stroke-amber-500 dark:fill-amber-950 dark:stroke-amber-400",
    text: "text-amber-950 dark:text-amber-50",
    label: "soft skip",
  },
  db: {
    shape: "cylinder",
    svg: "fill-sky-50 stroke-sky-500 dark:fill-sky-950 dark:stroke-sky-400",
    text: "text-sky-950 dark:text-sky-50",
    label: "db",
  },
  api: {
    shape: "parallelogram",
    svg: "fill-fuchsia-50 stroke-fuchsia-500 dark:fill-fuchsia-950 dark:stroke-fuchsia-400",
    text: "text-fuchsia-950 dark:text-fuchsia-50",
    label: "api",
  },
  missing: {
    shape: "pill",
    box: "bg-transparent border-neutral-400 dark:border-neutral-500",
    svg: "fill-transparent stroke-neutral-400 dark:stroke-neutral-500",
    text: "text-neutral-500 dark:text-neutral-400",
    label: "missing",
  },
};

const HANDLE = "!h-2 !w-2 !min-h-0 !min-w-0 !border-0 !bg-neutral-400 opacity-0";

/** Where text fits inside each shape, as padding on the node box. */
const INSET: Record<Shape, string> = {
  pill: "px-7 py-2",
  rect: "px-4 py-2",
  diamond: "px-10 py-6",
  cylinder: "px-5 pt-6 pb-3",
  parallelogram: "px-9 py-2",
};

function ShapeSvg({ shape, className, dashed, selected }: { shape: Shape; className: string; dashed: boolean; selected: boolean }) {
  const common = {
    className,
    vectorEffect: "non-scaling-stroke" as const,
    strokeWidth: selected ? 2.5 : 1.5,
    strokeDasharray: dashed ? "6 5" : undefined,
  };
  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden
    >
      {shape === "diamond" && <polygon points="50,1 99,50 50,99 1,50" {...common} />}
      {shape === "parallelogram" && <polygon points="14,1 99,1 86,99 1,99" {...common} />}
      {shape === "cylinder" && (
        <path d="M1,14 A49,13 0 0 1 99,14 V86 A49,13 0 0 1 1,86 Z" {...common} />
      )}
    </svg>
  );
}

export const StepNodeView = memo(function StepNodeView({ id, data, selected }: NodeProps<StepNode>) {
  const look = LOOK[data.variant];
  const { step } = data;
  const problems = data.diagnostics.length;

  const headline =
    data.variant === "missing"
      ? `flow-${data.order} missing`
      : data.variant === "client"
        ? step?.filePath.split("/").pop() // callers often share a description; the file tells them apart
        : step?.kind === "db"
        ? `${step.table}.${step.op}`
        : step?.kind === "api"
          ? step.service
          : step?.kind === "fail"
            ? (step.status ?? "fail")
            : undefined;

  return (
    <div
      className={cn("relative h-full w-full", look.text)}
      title={step?.description || undefined}
    >
      <NodeResizer
        isVisible={selected}
        minWidth={120}
        minHeight={56}
        lineClassName="!border-sky-400/70"
        handleClassName="!h-2 !w-2 !rounded-sm !border-0 !bg-sky-500"
        onResizeEnd={(_, p) =>
          savePlacement(data.flowId, id, { x: p.x, y: p.y, width: p.width, height: p.height })
        }
      />
      <Handle id="top" type="target" position={Position.Top} className={HANDLE} />
      <Handle id="left" type="target" position={Position.Left} className={HANDLE} />

      {look.box ? (
        <div
          className={cn(
            "absolute inset-0 border",
            look.shape === "pill" ? "rounded-full" : "rounded-md",
            look.box,
            data.variant === "missing" && "border-dashed",
            data.variant === "end" && "ring-2 ring-offset-2 ring-emerald-500 ring-offset-background dark:ring-emerald-400",
            selected ? "border-[2.5px] shadow-lg" : "border-[1.5px]",
          )}
        />
      ) : (
        <ShapeSvg shape={look.shape} className={look.svg} dashed={false} selected={!!selected} />
      )}

      <div
        className={cn(
          "relative flex h-full w-full flex-col items-center justify-center gap-0.5 overflow-hidden text-center",
          INSET[look.shape],
        )}
      >
        {/* The shape already says the kind; the header only carries position. */}
        <div className="flex max-w-full items-center gap-1 overflow-hidden font-mono text-[10px] leading-none whitespace-nowrap opacity-70">
          <span>flow-{data.order}</span>
          {data.case && (
            <span className="truncate rounded bg-current/10 px-1">case:{data.case}</span>
          )}
          {(data.isStart || data.isEnd) && data.variant !== "start" && data.variant !== "end" && (
            <span className="rounded bg-current/10 px-1">{data.isStart ? "entry" : "end"}</span>
          )}
        </div>

        {headline !== undefined && (
          <div
            className={cn(
              "truncate font-mono font-semibold leading-tight",
              step?.kind === "fail" ? "text-lg" : "text-[13px]",
            )}
          >
            {headline}
          </div>
        )}

        {step?.description && (
          <div
            className={cn(
              "line-clamp-2 leading-snug",
              headline === undefined ? "text-[13px]" : "text-[11px] opacity-80",
            )}
          >
            {step.description}
          </div>
        )}
      </div>

      {problems > 0 && (
        <span
          className="absolute -top-1.5 -right-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-rose-600 px-1 text-[11px] font-semibold text-white shadow"
          title={data.diagnostics.map((d) => d.message).join("\n")}
        >
          {problems}
        </span>
      )}

      <Handle id="bottom" type="source" position={Position.Bottom} className={HANDLE} />
      <Handle id="right" type="source" position={Position.Right} className={HANDLE} />
    </div>
  );
});

export const nodeTypes = { step: StepNodeView };

/** Small shape swatches for the legend. */
export function LegendItem({ variant }: { variant: Variant }) {
  const look = LOOK[variant];
  return (
    <div className="flex items-center gap-2">
      <span className="relative inline-block h-4 w-7">
        {look.box ? (
          <span
            className={cn(
              "absolute inset-0 border-[1.5px]",
              look.shape === "pill" ? "rounded-full" : "rounded-sm",
              look.box,
              variant === "missing" && "border-dashed",
            )}
          />
        ) : (
          <ShapeSvg shape={look.shape} className={look.svg} dashed={false} selected={false} />
        )}
      </span>
      <span>{look.label}</span>
    </div>
  );
}
