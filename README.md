# kanrai

Trace how an HTTP request moves through your codebase, from annotations your AI
agent leaves in the source.

<video src="https://raw.githubusercontent.com/noah071610/Kanrai/main/assets/preview.mp4" controls muted autoplay loop playsinline width="100%"></video>

[▶ Watch the preview](assets/preview.mp4)

```
// [POST: /api/auth/login flow-1] Entry point; reads email and password
// [POST: /api/auth/login flow-1 fail:400] Body fails validation
// [POST: /api/auth/login flow-2 db:users:read] Looks the user up by email
// [POST: /api/orders flow-3 branch] By payment method
// [POST: /api/orders flow-4 case:card api:stripe] Charges the card
```

A static parser collects those comments into `.kanrai/flows.json`, a CLI serves
a browser view of the result, and an optional VS Code extension lets you
Cmd/Ctrl+click from each annotation to the next step(s). When the project uses
Prisma, Drizzle, TypeORM or Sequelize, the table schema is read into
`.kanrai/db.json` as side data.

## Getting started

```bash
npm install
npm run build

# try it against a bundled sample: node (Express-style + Prisma) or django (DRF + Django models)
npm run scan:node         # or scan:django
npm run visualize:django  # viewer + watcher; watch:<name> for the watcher alone
```

To test the VS Code extension, pick **kanrai: Extension (node)** or
**kanrai: Extension (django)** in Run and Debug and press F5. It builds core,
db and the extension, then opens that sample as the workspace. The samples are
read statically; nothing needs to be installed in them. The Django schema reader
needs `python3` (3.9+) on PATH.

`npm run build` builds core → db → viewer → cli in that order. `npm test` runs
the core and db checks against those builds. The CLI serves the
viewer's `dist/`, so the viewer has to be built first.

During development:

```bash
npm run dev:core      # tsup --watch on the parser
npm run dev:viewer    # vite dev server, proxies /api to port 4477
```

## Commands

| Command            | What it does                                                                         |
| ------------------ | ------------------------------------------------------------------------------------ |
| `kanrai init`      | Writes `kanrai.config.json` and prints the prompt to hand your AI agent              |
| `kanrai scan`      | Full rescan of flows and DB schema. `--strict` exits non-zero on flow errors, for CI |
| `kanrai watch`     | Keeps both indexes current as files change                                           |
| `kanrai visualize` | Serves the viewer and watches at the same time                                       |

## Layout

```
packages/core     parser, graph rules, validator, scanner, watcher, store
packages/db       ORM schema readers → db.json, depends on core
packages/cli      commander + Hono server, depends on core and db
packages/vscode   optional extension, bundles core and db (no Node install needed)
apps/viewer       Vite + React frontend served by the CLI
skills/           the annotation skill for Claude Code / Codex
examples/node     Express-style sample with a Prisma schema
examples/django   Django REST framework sample with Django models
```

## Configuration

`kanrai.config.json`, every field optional:

| Field                 | Default      |                                                                                                                                                                                                                           |
| --------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `include` / `exclude` | source globs | files scanned for annotations                                                                                                                                                                                             |
| `outDir`              | `.kanrai`    | where `flows.json` and `db.json` go                                                                                                                                                                                       |
| `debounceMs`          | `300`        | quiet time before re-indexing                                                                                                                                                                                             |
| `editorScheme`        | `vscode`     | deep-link scheme for the viewer                                                                                                                                                                                           |
| `db`                  | `auto`       | `auto` detects the ORM from package.json, then pyproject.toml / requirements\*.txt / Pipfile / setup.py; or `prisma`, `drizzle`, `typeorm`, `sequelize`, `django`, `sqlalchemy`, `sqlmodel`; `false` turns DB reading off |

## Design decisions worth not re-litigating

**The comments are the source of truth.** The index is a derived artifact,
regenerated on every change. Nothing — not a human, not an agent — edits
`.kanrai/flows.json` by hand. That is why it is gitignored and why it lives
behind a dot directory.

**Watching happens at the filesystem level, not on editor save events.** Agents
like Claude Code write files from their own process, and a file that is not open
in the editor never fires a save event at all. `chokidar` catches those, and
makes the editor's autosave setting irrelevant.

**Validation lives in core, not in the extension.** The extension is optional.
Validation that only runs for people who installed it is validation most users
never see.

**`init` never runs the user's AI agent.** Spending someone else's model credits
from an install hook is a trust violation, and interactive prompts break
`npm ci`. `init` prepares the prompt; the user pastes it.

**"Next step" is defined once.** `nextSteps()` in `core/src/graph.ts` decides
where fails, branches and arms connect. The validator, the editor jump and the
viewer's edges all use it; nothing re-derives it.

**The DB is side data, never a dependency.** `db.json` has its own watcher and
its own failure modes. No ORM, an unsupported ORM, or a schema that fails to
parse leaves flows untouched; a failed parse keeps the last good tables.

**Drizzle runs user code, the others do not.** Drizzle schemas are executed in
a child process to read the real table config. Prisma is parsed as text;
TypeORM and Sequelize models are read statically with the TypeScript parser,
because loading them at runtime needs decorator metadata or a live Sequelize
instance.

**Full scan is the baseline; incremental is an optimization.** `scanProject`
always produces a correct index. `updateFile` reuses the previous one, so it is
only as correct as what came before — anything that could invalidate untouched
files should fall back to a full scan.

## Renaming

The name `kanrai` appears in package names (`@kanrai/*`), the `bin` entry, the
config filename, `DEFAULT_CONFIG.outDir`, and the extension manifest. A
find-and-replace across the repo plus `rm -rf node_modules && npm install`
covers it.

## Publishing

Only `packages/cli` goes to npm, as `kanrai`. It bundles core and db; their
third-party dependencies are listed in the CLI's own `dependencies`, so adding
one to core or db means adding it there too. `prepack` copies
`apps/viewer/dist` into `packages/cli/viewer`, so build first:

```bash
npm run build
cd packages/cli && npm pack   # install the tarball in a sample project and try it
npm publish
```

core, db and viewer are `private` and never published.

## Not built yet

- Quick Fix actions in the extension (renumber, insert missing step)
