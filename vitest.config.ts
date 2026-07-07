import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    // test/integration/**/*.browser.test.ts needs a real Worker, which
    // neither Node nor jsdom implement — it runs only under
    // vitest.browser.config.ts (`pnpm test:integration`).
    exclude: ["test/integration/**"],
  },
});
