import { execFile } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import fg from "fast-glob";

import WORKER from "./python-worker.py";
import type { Reader } from "./reader.js";

const TIMEOUT_MS = 20_000;

/** Project virtualenvs first, so the parser matches the project's Python syntax. */
const INTERPRETERS = [
  ".venv/bin/python",
  "venv/bin/python",
  ".venv/Scripts/python.exe",
  "venv/Scripts/python.exe",
];

async function findPython(root: string): Promise<string[]> {
  const local: string[] = [];
  for (const candidate of INTERPRETERS) {
    const absolute = path.join(root, candidate);
    if (await access(absolute).then(() => true, () => false)) local.push(absolute);
  }
  return [...local, "python3", "python"];
}

function run(python: string, root: string, input: string) {
  return new Promise<string>((resolve, reject) => {
    const child = execFile(
      python,
      ["-c", WORKER],
      { cwd: root, timeout: TIMEOUT_MS, maxBuffer: 64 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) reject(Object.assign(error, { stderr: stderr.trim() }));
        else resolve(stdout);
      },
    );
    child.stdin?.on("error", () => {}); // the callback reports the real failure
    child.stdin?.end(input);
  });
}

/**
 * Django, SQLAlchemy and SQLModel through one Python child process that parses
 * the model files with the stdlib `ast` — static like the TypeORM reader, no
 * user code runs.
 *
 * ponytail: re-reads every candidate `.py` file per run, fine to a few
 * thousand files; add an mtime cache like `createFileCache` if it shows up.
 */
export function pythonReader(
  root: string,
  orm: "django" | "sqlalchemy" | "sqlmodel",
  include: string[],
  exclude: string[],
): Reader {
  let python: string | null = null;

  return {
    relevant: (relative) => relative.endsWith(".py"),
    async read() {
      const paths = (await fg(include, { cwd: root, ignore: exclude, onlyFiles: true }))
        .filter((p) => p.endsWith(".py"))
        .sort();
      const files: { path: string; text: string }[] = [];
      for (const p of paths) {
        const text = await readFile(path.join(root, p), "utf8").catch(() => "");
        if (/\bclass\s|\bTable\(/.test(text)) files.push({ path: p, text });
      }
      const input = JSON.stringify({ orm, files });

      for (const candidate of python ? [python] : await findPython(root)) {
        try {
          const result = JSON.parse(await run(candidate, root, input));
          python = candidate;
          return result;
        } catch (error) {
          const e = error as NodeJS.ErrnoException & { stderr?: string };
          if (e.code === "ENOENT") continue;
          python = null;
          throw new Error(`Python model reader failed (${candidate}): ${e.stderr || e.message}`);
        }
      }
      throw new Error("No Python interpreter found (tried .venv, venv, python3, python).");
    },
  };
}
