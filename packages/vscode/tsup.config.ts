import { defineConfig } from "tsup"

// The extension host loads CommonJS and provides `vscode` at runtime.
// @kanrai/core and @kanrai/db are bundled in so the packaged .vsix is self-contained.
export default defineConfig([
  {
    entry: { extension: "src/extension.ts" },
    format: ["cjs"],
    outExtension: () => ({ js: ".cjs" }),
    sourcemap: true,
    clean: ["extension.*"], // not the whole dir: the worker config builds into it concurrently
    target: "node18",
    external: ["vscode"],
    noExternal: ["@kanrai/core", "@kanrai/db"],
    // db resolves its Drizzle worker from import.meta.url.
    shims: true,
  },
  {
    // The Drizzle reader runs this as its own process, so it is bundled whole
    // next to extension.cjs, where db looks for it.
    entry: { "drizzle-worker": "../db/src/drizzle-worker.ts" },
    format: ["cjs"],
    outExtension: () => ({ js: ".js" }),
    target: "node18",
    noExternal: [/.*/],
  },
])
