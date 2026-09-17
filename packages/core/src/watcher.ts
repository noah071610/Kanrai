import chokidar, { type FSWatcher } from "chokidar"
import path from "node:path"
import picomatch from "picomatch"

import { scanProject, updateFile } from "./scanner.js"
import { readIndex, writeIndex } from "./store.js"
import type { FlowIndex, KanraiConfig } from "./types.js"

export interface WatchOptions {
  root: string
  config: KanraiConfig
  /** Called after every successful index write. */
  onUpdate?: (index: FlowIndex) => void
  onError?: (error: unknown) => void
}

export interface WatchHandle {
  close: () => Promise<void>
  /** Force a full rescan — the escape hatch when incremental drifts. */
  rescan: () => Promise<FlowIndex>
  current: () => FlowIndex | null
}

/**
 * Watches the filesystem directly rather than hooking editor save events.
 *
 * This matters: Claude Code and Codex write files from their own process, and
 * a file that is not open in the editor never fires a save event at all. FS
 * level watching catches those, and makes the editor's autosave setting
 * irrelevant.
 */
export async function watchProject(options: WatchOptions): Promise<WatchHandle> {
  const { root, config, onUpdate, onError } = options

  let index: FlowIndex | null = await readIndex(root, config)
  if (!index) {
    index = await scanProject(root, config)
    await writeIndex(root, config, index)
    onUpdate?.(index)
  }

  // Coalesce bursts. An agent editing ten files in a row would otherwise
  // trigger ten rebuilds and ten browser repaints.
  const pending = new Map<string, "add" | "change" | "unlink">()
  let timer: NodeJS.Timeout | null = null

  const flush = async () => {
    timer = null
    const batch = [...pending.entries()]
    pending.clear()
    if (batch.length === 0) return

    try {
      let next = index!
      for (const [relative, event] of batch) {
        next = await updateFile(next, root, relative, event)
      }
      index = next
      await writeIndex(root, config, index)
      onUpdate?.(index)
    } catch (error) {
      onError?.(error)
    }
  }

  const schedule = (relative: string, event: "add" | "change" | "unlink") => {
    pending.set(relative, event)
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => void flush(), config.debounceMs)
  }

  // chokidar v4 removed glob support, so the include/exclude patterns are
  // applied here by hand. Directories are only skipped when `exclude` matches
  // them outright — skipping any directory that fails `include` would stop the
  // walk at the project root.
  const isIncluded = picomatch(config.include)
  const isExcluded = picomatch(config.exclude)

  const shouldIgnore = (absolute: string, stats?: { isDirectory(): boolean }) => {
    const relative = relativeToRoot(root, absolute)
    if (relative === "" || relative.startsWith("..")) return false
    if (isExcluded(relative)) return true
    if (stats?.isDirectory()) return false
    if (!stats) return false // unknown yet; the file event re-checks below
    return !isIncluded(relative)
  }

  const watcher: FSWatcher = chokidar.watch(root, {
    ignored: shouldIgnore,
    ignoreInitial: true,
    persistent: true,
    awaitWriteFinish: { stabilityThreshold: 80, pollInterval: 20 },
  })

  const accept = (absolute: string) => {
    const relative = relativeToRoot(root, absolute)
    return isIncluded(relative) && !isExcluded(relative) ? relative : null
  }

  const on = (event: "add" | "change" | "unlink") => (absolute: string) => {
    const relative = accept(absolute)
    if (relative) schedule(relative, event)
  }

  watcher.on("add", on("add"))
  watcher.on("change", on("change"))
  watcher.on("unlink", on("unlink"))
  watcher.on("error", (error) => onError?.(error))

  return {
    close: async () => {
      if (timer) clearTimeout(timer)
      await watcher.close()
    },
    rescan: async () => {
      index = await scanProject(root, config)
      await writeIndex(root, config, index)
      onUpdate?.(index)
      return index
    },
    current: () => index,
  }
}

export function relativeToRoot(root: string, absolute: string): string {
  return path.relative(root, absolute).split(path.sep).join("/")
}
