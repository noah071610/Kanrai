import { serve } from "@hono/node-server"
import { editorUri, flowGraph, loadConfig, stepKey, watchProject, type DbSchema, type FlowIndex } from "@kanrai/core"
import { watchDb } from "@kanrai/db"
import { Hono } from "hono"
import { spawn } from "node:child_process"
import { createReadStream, existsSync, statSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import pc from "picocolors"

const here = path.dirname(fileURLToPath(import.meta.url))

/** Viewer build output, resolved from the workspace or the published package. */
function resolveViewerDist(): string | null {
  const candidates = [path.resolve(here, "../viewer"), path.resolve(here, "../../../apps/viewer/dist")]
  return candidates.find((c) => existsSync(path.join(c, "index.html"))) ?? null
}

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
}

export async function runVisualize(options: { root: string; port: number; open: boolean }) {
  const { root, port } = options
  const config = await loadConfig(root)

  // The server and the watcher share one process, so pushing an update is a
  // plain function call rather than any kind of IPC.
  const clients = new Set<(payload: string) => void>()
  let latest: FlowIndex | null = null

  const handle = await watchProject({
    root,
    config,
    onUpdate: (index) => {
      latest = index
      const payload = JSON.stringify({ type: "update", generatedAt: index.generatedAt })
      for (const send of clients) send(payload)
    },
    onError: (error) => console.error(pc.red(String(error))),
  })
  latest = handle.current()

  let db: DbSchema | null = null
  const dbHandle = await watchDb({
    root,
    config,
    onUpdate: (schema) => {
      db = schema?.tables.length ? schema : null
      const payload = JSON.stringify({ type: "db-update" })
      for (const send of clients) send(payload)
    },
    onError: (error) => console.error(pc.red(String(error))),
  })
  db = dbHandle.current()?.tables.length ? dbHandle.current() : null

  const app = new Hono()

  // DNS rebinding guard: a page on another origin that resolves its name to
  // 127.0.0.1 would otherwise read the flow index (file paths, schema).
  app.use(async (c, next) => {
    const host = (c.req.header("host") ?? "").replace(/:\d+$/, "")
    if (!["localhost", "127.0.0.1", "[::1]"].includes(host)) return c.text("Forbidden", 403)
    await next()
  })

  app.get("/api/flows", (c) => {
    if (!latest) return c.json({ error: "index not ready" }, 503)
    return c.json({
      ...latest,
      // Precomputed so the browser never has to know about path resolution.
      links: latest.flows.flatMap((flow) =>
        flow.steps.map((step) => ({
          flowId: flow.id,
          order: step.order,
          step: stepKey(step),
          uri: editorUri(config, root, step.filePath, step.line, step.column),
        })),
      ),
      // The graph, from the same rules the editor jump uses. Keys are
      // `stepKey`; `missing` lists placeholders for skipped numbers.
      ...(() => {
        const graphs = latest.flows.map((flow) => ({ flowId: flow.id, ...flowGraph(flow) }))
        return {
          edges: graphs.flatMap((g) => g.edges.map((e) => ({ flowId: g.flowId, ...e }))),
          missing: graphs.flatMap((g) => g.missing.map((m) => ({ flowId: g.flowId, ...m }))),
        }
      })(),
    })
  })

  // No DB (unsupported ORM, none detected, nothing read) → 200 with `null`,
  // not 404: it is a normal state, and a 404 shows up red in the browser console.
  app.get("/api/db", (c) => {
    if (!db) return c.json(null)
    return c.json({
      ...db,
      links: db.tables.map((table) => ({
        table: table.name,
        uri: editorUri(config, root, table.filePath, table.line),
      })),
    })
  })

  app.post("/api/rescan", async (c) => {
    const index = await handle.rescan()
    return c.json({ ok: true, flows: index.flows.length })
  })

  // Server-sent events: one line per change, browser refetches /api/flows.
  app.get("/api/stream", (c) => {
    return new Response(
      new ReadableStream({
        start(controller) {
          const encoder = new TextEncoder()
          const send = (payload: string) => controller.enqueue(encoder.encode(`data: ${payload}\n\n`))
          send(JSON.stringify({ type: "hello" }))
          clients.add(send)
          const ping = setInterval(() => send(JSON.stringify({ type: "ping" })), 25_000)
          c.req.raw.signal.addEventListener("abort", () => {
            clearInterval(ping)
            clients.delete(send)
            try {
              controller.close()
            } catch {
              /* already closed */
            }
          })
        },
      }),
      {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      },
    )
  })

  const dist = resolveViewerDist()
  if (dist) {
    app.get("/*", async (c) => {
      const requested = decodeURIComponent(new URL(c.req.url).pathname)
      const relative = requested === "/" ? "index.html" : requested.slice(1)
      let file = path.join(dist, relative)
      const inside = !path.relative(dist, file).startsWith("..")
      if (!inside || !existsSync(file) || !statSync(file).isFile()) {
        file = path.join(dist, "index.html") // SPA fallback
      }
      const stream = createReadStream(file)
      return new Response(stream as unknown as ReadableStream, {
        headers: { "Content-Type": MIME[path.extname(file)] ?? "application/octet-stream" },
      })
    })
  } else {
    app.get("/", (c) =>
      c.html(
        `<pre style="font:14px ui-monospace;padding:24px">Viewer not built.
Run: npm run build:viewer

The JSON API is live in the meantime:
  /api/flows
  /api/stream</pre>`,
      ),
    )
  }

  // Loopback only: the index exposes file paths and the DB schema.
  serve({ fetch: app.fetch, port, hostname: "127.0.0.1" }, (info) => {
    const url = `http://localhost:${info.port}`
    console.log(`${pc.green("kanrai")} ${url}`)
    console.log(pc.dim("Watching for changes — Ctrl+C to stop."))
    if (options.open) openBrowser(url)
  })

  const stop = async () => {
    await Promise.all([handle.close(), dbHandle.close()])
    process.exit(0)
  }
  process.on("SIGINT", () => void stop())
  process.on("SIGTERM", () => void stop())
}

function openBrowser(url: string) {
  const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open"
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url]
  try {
    spawn(cmd, args, { stdio: "ignore", detached: true }).unref()
  } catch {
    /* headless environment — the URL is printed above */
  }
}
