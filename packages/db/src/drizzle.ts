import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import picomatch from "picomatch";

import type { Reader } from "./reader.js";

const WORKER = fileURLToPath(new URL("./drizzle-worker.js", import.meta.url));
const TIMEOUT_MS = 20_000;

/**
 * Runs the schema through Drizzle itself (`getTableConfig`) in a child process.
 * A few hundred ms per run — slower than the static readers, but it sees the
 * real column config, enum values and constraints.
 */
export function drizzleReader(root: string): Reader {
  // Unknown until the first run reads drizzle.config; until then only the
  // config file itself counts.
  let matches = picomatch("drizzle.config.*");

  return {
    relevant: (relative) => matches(relative),
    read: () =>
      new Promise((resolve, reject) => {
        execFile(
          process.execPath,
          [WORKER, root],
          {
            cwd: root,
            timeout: TIMEOUT_MS,
            maxBuffer: 64 * 1024 * 1024,
            // Inside the VS Code extension host execPath is Electron; this makes it act as node.
            env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
          },
          (error, stdout, stderr) => {
            if (error) {
              reject(new Error(`Drizzle schema could not be loaded: ${stderr.trim() || error.message}`));
              return;
            }
            try {
              const result = JSON.parse(stdout);
              matches = picomatch(["drizzle.config.*", ...result.globs]);
              resolve({ tables: result.tables, diagnostics: result.diagnostics });
            } catch (e) {
              reject(e);
            }
          },
        );
      }),
  };
}
