import {
    DB_SCHEMA_VERSION,
    readDbSchema,
    relativeToRoot,
    removeDbSchema,
    writeDbSchema,
    type KanraiConfig,
    type DbSchema,
    type Orm,
} from "@kanrai/core";
import chokidar from "chokidar";
import fg from "fast-glob";
import { readFile } from "node:fs/promises";
import path from "node:path";
import picomatch from "picomatch";

import { drizzleReader } from "./drizzle.js";
import { prismaReader } from "./prisma.js";
import { pythonReader } from "./python.js";
import type { Reader } from "./reader.js";
import { sequelizeReader } from "./sequelize.js";
import { typeormReader } from "./typeorm.js";

/** First match wins, in this order. */
const PACKAGES: [Orm, string[]][] = [
  ["prisma", ["prisma", "@prisma/client"]],
  ["drizzle", ["drizzle-orm"]],
  ["typeorm", ["typeorm"]],
  ["sequelize", ["sequelize", "sequelize-typescript"]],
];

/**
 * First match wins. SQLModel before SQLAlchemy: it pulls SQLAlchemy in, and a
 * project listing both defines its tables with SQLModel.
 */
const PYTHON_PACKAGES: [Orm, RegExp][] = [
  ["sqlmodel", /(^|[^\w-])sqlmodel(?![\w-])/im],
  ["django", /(^|[^\w-])django(?![\w-])/im],
  ["sqlalchemy", /(^|[^\w-])sqlalchemy(?![\w-])/im],
];

/** Files a change to which can change the detected ORM. */
const DEPENDENCY_FILES = /^(package\.json|pyproject\.toml|Pipfile|setup\.(py|cfg)|requirements[^/]*\.(txt|in)|requirements\/[^/]+\.(txt|in))$/;

/**
 * Which ORM the project uses: the root package.json, then the root Python
 * dependency files (pyproject.toml, requirements*.txt, Pipfile, setup.py/cfg).
 *
 * ponytail: root files only; in a monorepo where the ORM lives in a
 * sub-package, set `"db"` in kanrai.config.json.
 */
export async function detectOrm(root: string, config: KanraiConfig): Promise<Orm | null> {
  if (config.db === false) return null;
  if (config.db !== "auto") return config.db;
  try {
    const pkg = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    const found = PACKAGES.find(([, names]) => names.some((n) => n in deps))?.[0];
    if (found) return found;
  } catch {
    // no or broken package.json: still a candidate Python project
  }
  const files = await fg(["pyproject.toml", "Pipfile", "setup.py", "setup.cfg", "requirements*.{txt,in}", "requirements/*.{txt,in}"], { cwd: root });
  // Comments dropped so `# not using django anymore` does not count.
  const text = (await Promise.all(files.map((f) => readFile(path.join(root, f), "utf8").catch(() => ""))))
    .join("\n")
    .replace(/#.*$/gm, "");
  return PYTHON_PACKAGES.find(([, pattern]) => pattern.test(text))?.[0] ?? null;
}

function createReader(orm: Orm, root: string, config: KanraiConfig): Reader {
  switch (orm) {
    case "prisma":
      return prismaReader(root, config.exclude);
    case "drizzle":
      return drizzleReader(root);
    case "typeorm":
      return typeormReader(root, config.include, config.exclude);
    case "sequelize":
      return sequelizeReader(root, config.include, config.exclude);
    case "django":
    case "sqlalchemy":
    case "sqlmodel":
      return pythonReader(root, orm, config.include, config.exclude);
  }
}

/**
 * Reads the schema and writes db.json. When the read fails, the previous
 * tables are kept and the failure becomes a diagnostic — a half-saved schema
 * file must not blank out the DB for everything reading db.json.
 */
async function refresh(
  root: string,
  config: KanraiConfig,
  orm: Orm,
  reader: Reader,
  previous: DbSchema | null,
): Promise<DbSchema> {
  let result: Pick<DbSchema, "tables" | "diagnostics">;
  try {
    result = await reader.read();
  } catch (error) {
    result = {
      tables: previous?.orm === orm ? previous.tables : [],
      diagnostics: [
        {
          code: "db-parse",
          severity: "warning",
          message: `Could not read the ${orm} schema, keeping the last good one: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
  const schema: DbSchema = {
    schemaVersion: DB_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    orm,
    tables: result.tables.sort((a, b) => a.name.localeCompare(b.name)),
    diagnostics: result.diagnostics,
  };
  // Nothing read (an ORM in package.json but no models it can find, e.g. a
  // monorepo root) is "no DB", same as an unsupported ORM: no db.json, so the
  // viewer and the extension show nothing. The diagnostics still reach the CLI.
  if (schema.tables.length > 0) await writeDbSchema(root, config, schema);
  else await removeDbSchema(root, config);
  return schema;
}

/** One-shot read for `kanrai scan`. Null (and no db.json) when no ORM. */
export async function scanDb(root: string, config: KanraiConfig): Promise<DbSchema | null> {
  const orm = await detectOrm(root, config);
  if (!orm) {
    await removeDbSchema(root, config);
    return null;
  }
  return refresh(root, config, orm, createReader(orm, root, config), await readDbSchema(root, config));
}

export interface DbWatchHandle {
  close: () => Promise<void>;
  current: () => DbSchema | null;
}

/**
 * Keeps db.json current. Independent of the flow watcher on purpose: nothing
 * here can break flows.json. Runs never overlap — changes that land during a
 * run (Drizzle takes a few hundred ms) queue exactly one more.
 */
export async function watchDb(options: {
  root: string;
  config: KanraiConfig;
  onUpdate?: (schema: DbSchema | null) => void;
  onError?: (error: unknown) => void;
}): Promise<DbWatchHandle> {
  const { root, config, onUpdate, onError } = options;

  let orm: Orm | null = null;
  let reader: Reader | null = null;
  let schema: DbSchema | null = await readDbSchema(root, config);

  let running = false;
  let again = false;
  let redetect = true;

  const run = async () => {
    if (running) {
      again = true;
      return;
    }
    running = true;
    try {
      do {
        again = false;
        if (redetect) {
          redetect = false;
          const next = await detectOrm(root, config);
          if (next !== orm) {
            orm = next;
            reader = orm ? createReader(orm, root, config) : null;
          }
        }
        if (!orm || !reader) {
          if (schema) {
            schema = null;
            await removeDbSchema(root, config);
            onUpdate?.(null);
          }
          continue;
        }
        schema = await refresh(root, config, orm, reader, schema);
        onUpdate?.(schema);
      } while (again);
    } catch (error) {
      onError?.(error);
    } finally {
      running = false;
    }
  };

  let timer: NodeJS.Timeout | null = null;
  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void run(), config.debounceMs);
  };

  await run();

  const isExcluded = picomatch(config.exclude);
  const watcher = chokidar.watch(root, {
    ignoreInitial: true,
    ignored: (absolute) => {
      const relative = relativeToRoot(root, absolute);
      return relative !== "" && !relative.startsWith("..") && isExcluded(relative);
    },
    awaitWriteFinish: { stabilityThreshold: 80, pollInterval: 20 },
  });
  const onChange = (absolute: string) => {
    const relative = relativeToRoot(root, absolute);
    if (DEPENDENCY_FILES.test(relative)) {
      redetect = true;
      schedule();
    } else if (reader?.relevant(relative)) {
      schedule();
    }
  };
  watcher.on("add", onChange).on("change", onChange).on("unlink", onChange);
  watcher.on("error", (error) => onError?.(error));

  return {
    close: async () => {
      if (timer) clearTimeout(timer);
      await watcher.close();
    },
    current: () => schema,
  };
}
