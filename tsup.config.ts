import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: { index: "src/index.ts" },
    tsconfig: "tsconfig.json",
    format: ["esm"],
    dts: true,
    clean: true,
    sourcemap: true,
    target: "es2022",
  },
  {
    entry: { worker: "src/worker.ts" },
    tsconfig: "tsconfig.worker.json",
    format: ["esm"],
    dts: true,
    clean: false,
    sourcemap: true,
    target: "es2022",
  },
]);
