import { Command } from "commander"
import path from "node:path"

import { runInit } from "./commands/init.js"
import { runScan } from "./commands/scan.js"
import { runVisualize } from "./commands/visualize.js"
import { runWatch } from "./commands/watch.js"

const program = new Command()

program.name("kanrai").description("Trace API request flows from source comments.").version("0.0.1")

const resolveRoot = (value?: string) => path.resolve(value ?? process.cwd())

program
  .command("init")
  .description("Create kanrai.config.json and print the annotation prompt.")
  .option("-C, --cwd <dir>", "project root")
  .option("--force", "overwrite an existing config", false)
  .action(async (opts) => {
    await runInit({ root: resolveRoot(opts.cwd), force: Boolean(opts.force) })
  })

program
  .command("scan")
  .description("Full scan: rebuild the flow index from scratch.")
  .option("-C, --cwd <dir>", "project root")
  .option("--json", "print the index as JSON instead of a summary", false)
  .option("--strict", "exit with a non-zero code when errors are found (for CI)", false)
  .action(async (opts) => {
    await runScan({
      root: resolveRoot(opts.cwd),
      json: Boolean(opts.json),
      strict: Boolean(opts.strict),
    })
  })

program
  .command("watch")
  .description("Keep the flow index up to date as files change.")
  .option("-C, --cwd <dir>", "project root")
  .action(async (opts) => {
    await runWatch({ root: resolveRoot(opts.cwd) })
  })

program
  .command("visualize", { isDefault: false })
  .alias("view")
  .description("Serve the flow viewer in a browser (watches while it runs).")
  .option("-C, --cwd <dir>", "project root")
  .option("-p, --port <port>", "port to listen on", "4477")
  .option("--no-open", "do not open a browser automatically")
  .action(async (opts) => {
    await runVisualize({
      root: resolveRoot(opts.cwd),
      port: Number.parseInt(opts.port, 10),
      open: opts.open !== false,
    })
  })

program.parseAsync(process.argv).catch((error) => {
  console.error(error)
  process.exit(1)
})
