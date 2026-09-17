import { useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  Check,
  ChevronRight,
  Code2,
  Copy,
  Database,
  ExternalLink,
  FileCode,
  Gauge,
  Info,
  Key,
  Pencil,
  Plus,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import { openInEditor, type DbPayload } from "../api";
import {
  buildPrompt,
  defaultPromptTemplates,
  loadPromptTemplates,
  promptKinds,
  savePromptTemplates,
  type PromptKind,
  type PromptLanguage,
  type PromptTemplates,
} from "../prompts";
import { useViewerStore, type InspectorTab } from "../store";
import type { StepNode, StepNodeData, Variant } from "./model";

const VARIANT_BADGES: Record<
  Variant,
  { label: string; className: string }
> = {
  client: {
    label: "client call",
    className: "bg-teal-500/10 text-teal-700 dark:text-teal-300 border-teal-500/25",
  },
  start: {
    label: "entry",
    className: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/25",
  },
  step: {
    label: "step",
    className: "bg-muted text-muted-foreground border-border/70",
  },
  end: {
    label: "end",
    className: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/25",
  },
  branch: {
    label: "branch",
    className: "bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/25",
  },
  fail: {
    label: "fail",
    className: "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/25",
  },
  "soft-fail": {
    label: "soft skip",
    className: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/25",
  },
  db: {
    label: "db",
    className: "bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/25",
  },
  api: {
    label: "api",
    className: "bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300 border-fuchsia-500/25",
  },
  missing: {
    label: "missing",
    className: "bg-neutral-500/10 text-neutral-600 dark:text-neutral-400 border-dashed border-neutral-400/40",
  },
};

/** Right panel for the selection: `info` for the last picked node, `prompt` for all of them. */
export function Inspector({
  nodes,
  allNodes,
  root,
  db,
  onClose,
}: {
  /** Selected nodes in selection order; never empty. */
  nodes: StepNode[];
  /** 누락 placeholder를 포함한 현재 flow의 모든 node. */
  allNodes: StepNode[];
  root: string;
  db: DbPayload | null;
  onClose: () => void;
}) {
  const tab = useViewerStore((s) => s.tab);
  const setTab = useViewerStore((s) => s.setTab);

  return (
    <aside className="flex h-full w-[370px] shrink-0 flex-col border-l border-border/80 bg-background/95 backdrop-blur-sm">
      {/* Header with Segmented Tab Switcher */}
      <header className="flex h-13 shrink-0 items-center justify-between border-b border-border/70 px-3.5">
        <div className="flex items-center rounded-lg bg-muted/60 p-1 border border-border/40 shadow-xs">
          <button
            type="button"
            onClick={() => setTab("info")}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-all duration-150 cursor-pointer",
              tab === "info"
                ? "bg-background text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Info className="size-3.5" />
            <span>Info</span>
          </button>
          <button
            type="button"
            onClick={() => setTab("prompt")}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-all duration-150 cursor-pointer",
              tab === "prompt"
                ? "bg-background text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Sparkles className="size-3.5" />
            <span>Prompt</span>
            <span
              className={cn(
                "ml-0.5 rounded-full px-1.5 py-0.2 font-mono text-[10px] font-semibold transition-colors",
                tab === "prompt"
                  ? "bg-primary/10 text-primary"
                  : "bg-muted-foreground/15 text-muted-foreground"
              )}
            >
              {nodes.length}
            </span>
          </button>
        </div>

        <Button
          variant="ghost"
          size="icon-sm"
          className="text-muted-foreground hover:text-foreground hover:bg-muted/80 rounded-md transition-colors"
          onClick={onClose}
          aria-label="Close inspector"
        >
          <X className="size-4" />
        </Button>
      </header>

      {/* Tab Contents */}
      {tab === "info" ? (
        <InfoTab data={nodes[nodes.length - 1]!.data} db={db} />
      ) : (
        <PromptTab nodes={nodes} allNodes={allNodes} root={root} />
      )}
    </aside>
  );
}

function PromptTab({
  nodes,
  allNodes,
  root,
}: {
  nodes: StepNode[];
  allNodes: StepNode[];
  root: string;
}) {
  const deselect = useViewerStore((s) => s.deselect);
  const selectAll = useViewerStore((s) => s.selectAll);
  const language = useViewerStore((s) => s.promptLanguage);
  const [copied, setCopied] = useState<PromptKind | "error" | null>(null);
  const [, setTemplateVersion] = useState(0);
  const templates = loadPromptTemplates(language);
  const kinds = promptKinds(templates);
  const selectedIds = new Set(nodes.map(({ id }) => id));
  const allSelected = allNodes.length > 0 && allNodes.every(({ id }) => selectedIds.has(id));

  const copyPrompt = async (kind: PromptKind) => {
    try {
      await navigator.clipboard.writeText(buildPrompt({ kind, language, nodes, allSelected }));
      setCopied(kind);
      setTimeout(() => setCopied(null), 2500);
    } catch {
      setCopied("error");
    }
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden text-sm">
      {/* Top Section: Quick Actions */}
      <div className="shrink-0 space-y-3.5 border-b border-border/70 p-3.5 bg-muted/20">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Generate Prompts
          </span>
          <span className="font-mono text-[11px] text-muted-foreground">
            {language}
          </span>
        </div>

        <div className="grid gap-2">
          {kinds.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => void copyPrompt(value)}
              className={cn(
                "group relative flex w-full items-center justify-between rounded-lg border p-3 text-left transition-all duration-150 cursor-pointer",
                copied === value
                  ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-900 dark:text-emerald-100"
                  : "border-border/80 bg-card hover:border-primary/40 hover:bg-muted/40 hover:shadow-xs"
              )}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className={cn(
                    "flex size-8 shrink-0 items-center justify-center rounded-md transition-colors",
                    copied === value
                      ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                      : "bg-primary/10 text-primary group-hover:bg-primary/15"
                  )}
                >
                  {copied === value ? <Check className="size-4" /> : <PromptIcon kind={value} />}
                </div>
                <div className="min-w-0">
                  <div className="truncate text-xs font-semibold text-foreground">{label}</div>
                  <div className="truncate text-[11px] text-muted-foreground">
                    {value === "security"
                      ? "Auth, validation & vulnerability checks"
                      : value === "optimization"
                        ? "Queries, latency & bottlenecks"
                        : value === "paths"
                          ? "Find the relevant files quickly"
                          : "Custom prompt template"}
                  </div>
                </div>
              </div>
              <span className="shrink-0 font-mono text-[11px] font-medium text-muted-foreground group-hover:text-foreground">
                {copied === value ? "Copied" : "Copy"}
              </span>
            </button>
          ))}
        </div>

        {/* Edit Prompt Templates Modal Button */}
        <PromptEditor language={language} onSaved={() => setTemplateVersion((version) => version + 1)} />

        {/* Scope status message */}
        <div
          className={cn(
            "rounded-md border p-2 text-[11px] leading-relaxed transition-colors flex items-start gap-1.5",
            copied === "error"
              ? "border-destructive/30 bg-destructive/10 text-destructive"
              : "border-border/50 bg-background/60 text-muted-foreground"
          )}
          role="status"
        >
          {copied === "error" ? (
            <>
              <AlertCircle className="size-3.5 shrink-0 mt-0.5" />
              <span>Clipboard access failed. Check browser permissions.</span>
            </>
          ) : (
            <>
              <Info className="size-3.5 shrink-0 mt-0.5 text-muted-foreground/80" />
              <span>
                {allSelected
                  ? "Prompt targets the complete annotated flow."
                  : "Prompt includes selected paths, lines, annotations, and schema context."}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Bottom Section: Selected Nodes List */}
      <div className="flex flex-1 flex-col min-h-0">
        <div className="flex items-center justify-between border-b border-border/70 px-3.5 py-2 bg-muted/10">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Target Scope
            </span>
            <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-[10px] font-medium text-foreground">
              {nodes.length} / {allNodes.length}
            </span>
          </div>

          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
            <input
              type="checkbox"
              checked={allSelected}
              aria-checked={!allSelected && nodes.length > 0 ? "mixed" : allSelected}
              onChange={() => selectAll(allSelected ? [] : allNodes.map(({ id }) => id))}
              className="size-3.5 rounded border-border accent-primary transition-all cursor-pointer"
            />
            <span className="text-[11px]">Select all</span>
          </label>
        </div>

        <ul className="flex-1 overflow-y-auto p-2 space-y-1.5">
          {nodes.map(({ id, data }) => {
            const file = data.step?.filePath;
            const fileName = file ? file.split("/").pop() : null;
            const dirPath = file ? file.split("/").slice(0, -1).join("/") : null;
            const badge = VARIANT_BADGES[data.variant];

            return (
              <li
                key={id}
                className="group relative rounded-lg border border-border/60 bg-card p-2.5 transition-all hover:border-border hover:bg-muted/30"
              >
                <label className="flex cursor-pointer items-start gap-2.5">
                  <input
                    type="checkbox"
                    checked
                    onChange={() => deselect(id)}
                    className="mt-1 size-3.5 shrink-0 rounded border-border accent-primary cursor-pointer"
                  />
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-mono text-xs font-semibold text-foreground">
                        flow-{data.order}
                      </span>
                      {badge && (
                        <span
                          className={cn(
                            "rounded border px-1.5 py-0.2 font-mono text-[10px] font-medium",
                            badge.className
                          )}
                        >
                          {badge.label}
                        </span>
                      )}
                      {data.case && (
                        <span className="rounded border border-border/60 bg-muted/60 px-1.5 py-0.2 font-mono text-[10px] text-muted-foreground">
                          case:{data.case}
                        </span>
                      )}
                    </div>

                    {file ? (
                      <div className="min-w-0 font-mono text-[11px] leading-tight">
                        <span className="font-medium text-foreground">{fileName}</span>
                        {dirPath && (
                          <span className="block text-[10px] text-muted-foreground truncate" title={file}>
                            {dirPath}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="block text-xs text-muted-foreground italic">
                        no file (missing step)
                      </span>
                    )}

                    {data.step?.description && (
                      <p className="line-clamp-1 text-[11px] text-muted-foreground/90 font-sans">
                        {data.step.description}
                      </p>
                    )}
                  </div>
                </label>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function PromptIcon({ kind }: { kind: PromptKind }) {
  if (kind === "security") return <ShieldCheck className="size-4" />;
  if (kind === "optimization") return <Gauge className="size-4" />;
  if (kind === "paths") return <Copy className="size-4" />;
  return <Sparkles className="size-4" />;
}

function PromptEditor({ language, onSaved }: { language: PromptLanguage; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<PromptKind>("security");
  const [templates, setTemplates] = useState<PromptTemplates>(() => loadPromptTemplates(language));
  const [newName, setNewName] = useState("");
  const [nameError, setNameError] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const kinds = promptKinds(templates);

  const changeOpen = (next: boolean) => {
    if (next) {
      const loaded = loadPromptTemplates(language);
      setTemplates(loaded);
      setKind(promptKinds(loaded)[0]?.value ?? "");
      setNewName("");
      setNameError(false);
      setSaveFailed(false);
    }
    setOpen(next);
  };

  const save = () => {
    if (!savePromptTemplates(language, templates)) {
      setSaveFailed(true);
      return;
    }
    onSaved();
    setOpen(false);
  };

  const addPrompt = () => {
    const name = newName.trim();
    if (!name || name in templates) {
      setNameError(true);
      return;
    }
    setTemplates((current) => ({ ...current, [name]: "" }));
    setKind(name);
    setNewName("");
    setNameError(false);
  };

  const deletePrompt = () => {
    const next = { ...templates };
    delete next[kind];
    setTemplates(next);
    setKind(promptKinds(next)[0]?.value ?? "");
  };

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-center gap-1.5 border-dashed border-border/80 text-xs text-muted-foreground hover:text-foreground"
          />
        }
      >
        <Pencil className="size-3.5" />
        <span>Customize prompt templates</span>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Sparkles className="size-4 text-primary" />
            <span>Prompt Templates ({language})</span>
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Customize AI prompt blueprints for {language}. Saved locally in your browser.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            save();
          }}
          className="space-y-4 pt-1"
        >
          <FieldGroup className="space-y-3">
            <Field className="space-y-1.5">
              <div className="flex items-center justify-between">
                <FieldLabel htmlFor="prompt-kind" className="text-xs font-medium">
                  Template Type
                </FieldLabel>
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  className="gap-1 text-[11px]"
                  onClick={deletePrompt}
                  disabled={!kind}
                  title="Delete this prompt template"
                >
                  <Trash2 className="size-3" />
                  Delete
                </Button>
              </div>
              <div className="flex gap-2">
                <select
                  id="prompt-kind"
                  value={kind}
                  onChange={(event) => setKind(event.target.value as PromptKind)}
                  className="h-8.5 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-xs font-medium outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
                >
                  {kinds.map(({ value, label }) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
                <input
                  value={newName}
                  onChange={(event) => {
                    setNewName(event.target.value);
                    setNameError(false);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      addPrompt();
                    }
                  }}
                  placeholder="New prompt name"
                  aria-label="New prompt name"
                  aria-invalid={nameError || undefined}
                  className="h-8.5 w-36 rounded-md border border-input bg-background px-3 text-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
                />
                <Button type="button" variant="outline" size="sm" onClick={addPrompt} title="Add prompt template">
                  <Plus className="size-3.5" />
                  Add
                </Button>
              </div>
              {nameError && (
                <p className="text-[11px] text-destructive" role="alert">
                  Enter a unique prompt name.
                </p>
              )}
            </Field>

            <Field data-invalid={saveFailed || undefined} className="space-y-1.5" hidden={!kind}>
              <div className="flex items-center justify-between">
                <FieldLabel htmlFor="prompt-template" className="text-xs font-medium">
                  Template Content
                </FieldLabel>
                <span className="font-mono text-[10px] text-muted-foreground">
                  supports <code className="rounded bg-muted px-1 font-semibold text-foreground">{"{{target}}"}</code>
                </span>
              </div>
              <Textarea
                id="prompt-template"
                value={templates[kind] ?? ""}
                onChange={(event) =>
                  setTemplates((current) => ({ ...current, [kind]: event.target.value }))
                }
                className="min-h-[320px] max-h-[50vh] resize-y rounded-md border-border/80 bg-muted/20 font-mono text-[11px] leading-relaxed p-3 focus-visible:bg-background"
                aria-invalid={saveFailed || undefined}
              />
              <FieldDescription className="text-[11px] text-muted-foreground">
                <code className="rounded bg-muted px-1 font-semibold">{"{{target}}"}</code> becomes either the complete flow annotation or selected file metadata.
              </FieldDescription>
              {saveFailed && (
                <p className="text-xs text-destructive" role="alert">
                  Local storage is unavailable, so the template was not saved.
                </p>
              )}
            </Field>
          </FieldGroup>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mr-auto text-xs text-muted-foreground hover:text-foreground"
              onClick={() => {
                const defaults = defaultPromptTemplates(language);
                setTemplates(defaults);
                setKind(promptKinds(defaults)[0]?.value ?? "");
              }}
            >
              <RotateCcw className="size-3.5" />
              Reset defaults
            </Button>
            <DialogClose render={<Button type="button" variant="outline" size="sm" className="text-xs" />}>
              Cancel
            </DialogClose>
            <Button type="submit" size="sm" className="text-xs">
              Save changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Details for one node: what it does, where it lives, what is wrong. */
function InfoTab({ data, db }: { data: StepNodeData; db: DbPayload | null }) {
  const { step, table } = data;
  const tableUri = table && db?.links.find((l) => l.table === table.name)?.uri;
  const badge = VARIANT_BADGES[data.variant];

  return (
    <div className="flex-1 space-y-4 overflow-y-auto p-4 text-sm">
      {/* Node Identity Card */}
      <div className="rounded-xl border border-border/70 bg-card p-3.5 shadow-xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <span className="rounded-md bg-foreground/5 px-2 py-0.5 font-mono text-xs font-semibold text-foreground border border-border/50">
              flow-{data.order}
            </span>
            {badge && (
              <span
                className={cn(
                  "rounded-md border px-2 py-0.5 font-mono text-[11px] font-medium",
                  badge.className
                )}
              >
                {data.variant === "missing" ? "missing" : step?.kind ?? badge.label}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            {data.case && (
              <span className="rounded-md border border-border/70 bg-muted/60 px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
                case:{data.case}
              </span>
            )}
            {(data.isStart || data.isEnd) && (
              <span className="rounded-md bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 font-mono text-[10px] font-medium text-emerald-700 dark:text-emerald-300">
                {data.isStart ? "entry" : "end"}
              </span>
            )}
          </div>
        </div>

        {/* Step Description */}
        <div>
          {data.variant === "missing" ? (
            <div className="space-y-1 rounded-lg border border-dashed border-amber-500/40 bg-amber-500/5 p-3 text-xs text-amber-900 dark:text-amber-200">
              <div className="flex items-center gap-1.5 font-semibold">
                <AlertTriangle className="size-3.5 shrink-0 text-amber-600" />
                <span>Missing step sequence</span>
              </div>
              <p className="text-muted-foreground leading-relaxed">
                No annotation claims <code className="font-mono text-foreground font-medium">flow-{data.order}</code>
                {data.case ? <> in <code className="font-mono text-foreground font-medium">case:{data.case}</code></> : null}. The surrounding steps skip this number.
              </p>
            </div>
          ) : (
            <p className="text-sm font-medium leading-snug text-foreground">
              {step?.description || <em className="text-muted-foreground font-normal">No description</em>}
            </p>
          )}
        </div>

        {/* Fail / Soft-fail notice */}
        {step?.kind === "fail" && (
          <div
            className={cn(
              "rounded-lg border p-2.5 text-xs flex items-start gap-2",
              data.variant === "soft-fail"
                ? "border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200"
                : "border-rose-500/30 bg-rose-500/10 text-rose-900 dark:text-rose-200"
            )}
          >
            <AlertCircle className="size-4 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <div className="font-mono font-semibold">
                {step.status ?? "Status code unassigned"}
              </div>
              <div className="text-[11px] opacity-90">
                {data.variant === "soft-fail"
                  ? "Soft skip: answers 2xx without executing remaining workload"
                  : "Request fails or aborts and does not complete"}
              </div>
            </div>
          </div>
        )}

        {/* API target */}
        {step?.kind === "api" && (
          <div className="flex items-center gap-1.5 rounded-md bg-fuchsia-500/10 border border-fuchsia-500/20 px-2.5 py-1.5 text-xs font-mono text-fuchsia-700 dark:text-fuchsia-300">
            <ExternalLink className="size-3.5" />
            <span>Target service: {step.service}</span>
          </div>
        )}
      </div>

      {/* Code Inspector Card: File location & Raw code */}
      {step && (
        <div className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-xs">
          <div className="flex items-center justify-between border-b border-border/60 bg-muted/40 px-3 py-2">
            <div className="flex items-center gap-2 min-w-0">
              <FileCode className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate font-mono text-xs text-foreground font-medium" title={step.filePath}>
                {step.filePath}:{step.line}
              </span>
            </div>
            <Button
              variant="outline"
              size="xs"
              className="shrink-0 gap-1 text-[11px] font-medium"
              onClick={() => openInEditor(data.uri)}
              disabled={!data.uri}
            >
              <ExternalLink className="size-3" />
              Open
            </Button>
          </div>
          <div className="p-3 bg-muted/20">
            <pre className="overflow-x-auto rounded-md bg-background/80 border border-border/50 p-2.5 font-mono text-[11px] leading-relaxed whitespace-pre-wrap select-text text-foreground/90">
              {step.raw}
            </pre>
          </div>
        </div>
      )}

      {/* Diagnostics / Problems */}
      {data.diagnostics.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <AlertCircle className="size-3.5 text-rose-500" />
            <span>Problems ({data.diagnostics.length})</span>
          </div>
          <div className="space-y-1.5">
            {data.diagnostics.map((d, i) => (
              <div
                key={i}
                className={cn(
                  "rounded-lg border p-2.5 text-xs flex items-start gap-2",
                  d.severity === "error"
                    ? "border-rose-500/30 bg-rose-500/10 text-rose-900 dark:text-rose-200"
                    : "border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200"
                )}
              >
                <span className="shrink-0 font-mono font-bold">[{d.code}]</span>
                <span className="leading-snug">{d.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* DB Schema Details */}
      {step?.kind === "db" && (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Database className="size-3.5 text-sky-600 dark:text-sky-400" />
              <span className="font-mono text-xs font-semibold text-foreground">
                {step.table}
              </span>
              <span className="rounded bg-sky-500/15 text-sky-700 dark:text-sky-300 px-1.5 py-0.2 font-mono text-[10px] font-semibold uppercase">
                {step.op}
              </span>
              {table?.model && (
                <span className="font-mono text-[11px] text-muted-foreground">
                  ({table.model})
                </span>
              )}
            </div>

            {tableUri && (
              <Button
                variant="ghost"
                size="icon-xs"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => openInEditor(tableUri)}
                aria-label="Open model in editor"
              >
                <ExternalLink className="size-3.5" />
              </Button>
            )}
          </div>

          {table ? (
            <div className="space-y-2">
              <div className="overflow-hidden rounded-lg border border-border/70 bg-card shadow-xs">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border/60 bg-muted/40 text-left font-mono text-[10px] uppercase text-muted-foreground">
                      <th className="px-3 py-1.5 font-medium">Column</th>
                      <th className="px-2 py-1.5 font-medium">Type</th>
                      <th className="px-3 py-1.5 text-right font-medium">Key</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {table.columns.map((c) => (
                      <tr key={c.name} className="hover:bg-muted/30 transition-colors">
                        <td className="px-3 py-1.5 font-mono text-xs font-medium text-foreground">
                          {c.name}
                        </td>
                        <td className="px-2 py-1.5 font-mono text-[11px] text-muted-foreground">
                          <span>
                            {c.type}
                            {c.nullable && <span className="text-foreground/60">?</span>}
                          </span>
                          {c.enumValues && (
                            <div className="mt-0.5 text-[10px] text-foreground/70">
                              {c.enumValues.join(" | ")}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-1.5 text-right font-mono text-[10px] whitespace-nowrap">
                          {c.primary && (
                            <span className="inline-block rounded bg-sky-500/15 px-1 py-0.2 font-semibold text-sky-700 dark:text-sky-300 border border-sky-500/20">
                              PK
                            </span>
                          )}
                          {c.unique && !c.primary && (
                            <span className="inline-block rounded bg-muted px-1 py-0.2 font-semibold text-muted-foreground border border-border/60">
                              UQ
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {table.uniques.length > 0 && (
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Key className="size-3 text-muted-foreground/80 shrink-0" />
                  <span className="font-mono">
                    unique: {table.uniques.map((u) => `(${u.join(", ")})`).join(" ")}
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-lg border border-border/70 bg-muted/20 p-3 text-xs text-muted-foreground">
              {db
                ? `No table named "${step.table}" in the ${db.orm} schema.`
                : "No DB schema was found for this project."}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
