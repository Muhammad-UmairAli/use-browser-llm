import { defineConfig } from "vitest/config";

// Separate config for the real-Worker integration test
// (test/integration/*.browser.test.ts). Kept out of vitest.config.ts (the
// default `pnpm test`) so the CI-critical, GPU-free mocked-engine suite
// stays fast and has zero browser dependency — this one spins up a real
// headless Chromium via Playwright.
export default defineConfig({
  test: {
    include: ["test/integration/**/*.browser.test.ts"],
    browser: {
      enabled: true,
      name: "chromium",
      provider: "playwright",
      headless: true,
    },
  },
});
