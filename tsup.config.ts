import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: { index: "src/index.ts" },
    tsconfig: "tsconfig.json",
    format: ["esm"],
    dts: true,
    clean: true,
    // Off for the published build: tsup/esbuild source maps embed full
    // original TS source in `sourcesContent` by default, which would ship
    // all of src/ inside dist/*.js.map despite "files": ["dist"] looking
    // minimal — contradicts the "no source shipped" goal. Re-enable if a
    // real consumer debugging need shows up; strip sourcesContent instead
    // of just flipping this back on, to get stack-trace mapping without
    // re-embedding source text.
    sourcemap: false,
    target: "es2022",
  },
  {
    entry: { worker: "src/worker.ts" },
    tsconfig: "tsconfig.worker.json",
    format: ["esm"],
    dts: true,
    clean: false,
    // Off for the published build: tsup/esbuild source maps embed full
    // original TS source in `sourcesContent` by default, which would ship
    // all of src/ inside dist/*.js.map despite "files": ["dist"] looking
    // minimal — contradicts the "no source shipped" goal. Re-enable if a
    // real consumer debugging need shows up; strip sourcesContent instead
    // of just flipping this back on, to get stack-trace mapping without
    // re-embedding source text.
    sourcemap: false,
    target: "es2022",
  },
]);
