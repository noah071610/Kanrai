import { defineConfig } from "tsup";

// Dual ESM + CJS build. The VS Code extension host needs CJS;
// the CLI and modern tooling take ESM.
export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  target: "node18",
});
