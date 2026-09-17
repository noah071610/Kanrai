import { countBySeverity, loadConfig, watchProject } from "@kanrai/core"
import { watchDb } from "@kanrai/db"
import pc from "picocolors"

export async function runWatch(options: { root: string }) {
  const config = await loadConfig(options.root)

  const handle = await watchProject({
    root: options.root,
    config,
    onUpdate: (index) => {
      const counts = countBySeverity(index.diagnostics)
      const time = new Date().toLocaleTimeString()
      console.log(
        `${pc.dim(time)} ${index.flows.length} flows · ` +
          (counts.error ? pc.red(`${counts.error} error(s)`) : pc.green("clean")),
      )
    },
    onError: (error) => console.error(pc.red(String(error))),
  })

  const db = await watchDb({
    root: options.root,
    config,
    onUpdate: (schema) => {
      if (!schema) return
      const time = new Date().toLocaleTimeString()
      const problems = schema.diagnostics.length
      console.log(
        `${pc.dim(time)} db: ${schema.tables.length} tables (${schema.orm})` +
          (problems ? pc.yellow(` · ${problems} warning(s)`) : ""),
      )
    },
    onError: (error) => console.error(pc.red(String(error))),
  })

  console.log(pc.dim(`Watching ${options.root} — Ctrl+C to stop.`))

  const stop = async () => {
    await Promise.all([handle.close(), db.close()])
    process.exit(0)
  }
  process.on("SIGINT", () => void stop())
  process.on("SIGTERM", () => void stop())
}
