import { CONFIG_FILENAME, DEFAULT_CONFIG, writeConfig } from "@kanrai/core"
import { access, readFile } from "node:fs/promises"
import path from "node:path"
import pc from "picocolors"

/**
 * Deliberately does NOT invoke the user's AI agent.
 *
 * Spending someone else's model credits from a postinstall or an init command
 * is a trust violation, and interactive prompts break `npm ci`. So init
 * prepares the material and hands the trigger to the user.
 */
export async function runInit(options: { root: string; force: boolean }) {
  const { root, force } = options
  const configPath = path.join(root, CONFIG_FILENAME)

  let exists = false
  try {
    await access(configPath)
    exists = true
  } catch {
    exists = false
  }

  if (exists && !force) {
    console.log(pc.yellow(`${CONFIG_FILENAME} already exists. Use --force to overwrite.`))
  } else {
    await writeConfig(root, DEFAULT_CONFIG)
    console.log(pc.green(`Created ${path.relative(root, configPath) || CONFIG_FILENAME}`))
  }

  await warnIfNotIgnored(root)

  console.log("")
  console.log(pc.bold("Next: have your AI agent annotate the codebase."))
  console.log(pc.dim("Paste the prompt below into Claude Code / Codex.\n"))
  console.log(pc.dim("─".repeat(64)))
  console.log(ANNOTATION_PROMPT.trim())
  console.log(pc.dim("─".repeat(64)))
  console.log("")
  console.log(`Then run ${pc.cyan("npx kanrai scan")} and ${pc.cyan("npx kanrai visualize")}.`)
}

async function warnIfNotIgnored(root: string) {
  try {
    const gitignore = await readFile(path.join(root, ".gitignore"), "utf8")
    if (gitignore.includes(DEFAULT_CONFIG.outDir)) return
  } catch {
    // no .gitignore at all
  }
  console.log(
    pc.yellow(
      `\nAdd "${DEFAULT_CONFIG.outDir}/" to .gitignore — the index is generated and should never be committed or hand-edited.`,
    ),
  )
}

const ANNOTATION_PROMPT = `
Annotate this codebase with API flow comments so the request path through the
code can be reconstructed statically.

Format, on its own comment line directly above the code it describes:

    // [METHOD: /path flow-N] short description
    // [METHOD: /path flow-N tags] short description

Rules:
1. METHOD is an uppercase HTTP verb. /path is the route as registered.
2. Use the SAME method + path string for every step of one request. It is the
   grouping key — a typo splits the flow in two.
3. Number steps from flow-1 in execution order. No gaps, no duplicates.
4. flow-1 goes on the route handler entry point. Follow the call chain from
   there: middleware, service, repository, external calls, response.
5. One annotation per meaningful hop. Do not annotate trivial getters.
6. Do not edit the generated index file — it is rebuilt from these comments.

Tags (inside the bracket, after flow-N) are required on these steps:
- fail or fail:<status>  every error exit AND every soft skip (e.g. a 200 that
                         did nothing). Reuses the number of the step it exits.
- db:<table>:<op>        every DB access; op is create, read, update or delete.
- api:<service>          every call to an external service.
- branch                 where behavior splits by a value. Steps inside each
                         arm get case:<label> and number from branch + 1 on
                         their own; after the arms the main line continues
                         past the longest arm. Branches do not nest.

    // [POST: /api/orders flow-2 db:orders:read] Loads the cart
    // [POST: /api/orders flow-2 fail:404] Cart is empty
    // [POST: /api/orders flow-3 branch] By payment method
    // [POST: /api/orders flow-4 case:card api:stripe] Charges the card
    // [POST: /api/orders flow-4 case:bank] Queues a transfer
    // [POST: /api/orders flow-5] Responds

Work one endpoint at a time. Start by listing every route in the project, then
trace them one by one.
`
