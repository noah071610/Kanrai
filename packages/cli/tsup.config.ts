import { defineConfig } from "tsup"

// core and db are bundled so the published `kanrai` package is the only one on npm.
// Their third-party deps stay external: they are listed in this package's dependencies.
export default defineConfig([
  {
    entry: ["src/index.ts"],
    format: ["esm"],
    sourcemap: true,
    clean: ["index.*"], // not the whole dir: the worker config builds into it concurrently
    target: "node18",
    noExternal: ["@kanrai/core", "@kanrai/db"],
    banner: { js: "#!/usr/bin/env node" },
  },
  {
    // db resolves its Drizzle worker as ./drizzle-worker.js next to the bundle.
    entry: { "drizzle-worker": "../db/src/drizzle-worker.ts" },
    format: ["esm"],
    target: "node18",
  },
])
