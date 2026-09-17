import { defineConfig } from "tsup"

// The Drizzle worker is its own entry: it runs as a separate node process.
export default defineConfig({
  entry: ["src/index.ts", "src/drizzle-worker.ts"],
  format: ["esm"],
  dts: { entry: "src/index.ts" },
  sourcemap: true,
  clean: true,
  target: "node18",
  external: ["@kanrai/core"],
  // The Python model reader ships inside index.js as a string.
  loader: { ".py": "text" },
})
