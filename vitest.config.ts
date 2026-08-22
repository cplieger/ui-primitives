// Vitest configuration for @cplieger/ui-primitives unit tests.
//
// Every test file in this package drives real DOM, so the whole suite runs in
// Browser Mode against headless Chromium rather than a DOM emulator. There is
// no `environment` and no per-file `@vitest-environment` pragma: Browser Mode
// is not an environment, it is a runner, and it replaces happy-dom outright
// here because the package has no pure-Node tests to keep out of the browser.
//
// `channel: "chromium"` opts into Chromium's newer headless mode, which is the
// real browser rather than the separate headless-shell build, so a behavior
// verified here is the behavior a user gets. CI installs the browser with
// `npx playwright install --with-deps chromium`.
//
// Run: vitest --run (single pass) or vitest (watch mode).
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    browser: {
      enabled: true,
      headless: true,
      provider: playwright({
        launchOptions: {
          channel: "chromium",
        },
      }),
      instances: [{ browser: "chromium" }],
      // Fixed viewport so layout-dependent assertions are reproducible; a
      // real browser computes real boxes, unlike the emulator this replaced.
      viewport: { width: 1280, height: 720 },
      // A failure screenshot per failing test is noise in CI and cannot be
      // read from a job log; the assertion diff is the useful artifact.
      screenshotFailures: false,
    },
    include: ["src/**/*.test.ts"],
    exclude: ["node_modules/**"],
    passWithNoTests: false,
    allowOnly: false,
    globals: false,
    expect: {
      requireAssertions: true,
    },
    clearMocks: true,
    mockReset: true,
    restoreMocks: true,
    unstubEnvs: true,
    unstubGlobals: true,
    bail: process.env["CI"] ? 1 : 0,
    testTimeout: 5000,
    hookTimeout: 10000,
    slowTestThreshold: 300,
    sequence: {
      shuffle: { files: false, tests: false },
      concurrent: false,
      hooks: "stack",
    },
    setupFiles: ["./src/fc-strict-setup.ts"],
    printConsoleTrace: true,
    expandSnapshotDiff: true,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/**/*.d.ts", "src/**/*-setup.ts"],
      reportOnFailure: true,
      reporter: ["text", "text-summary", "lcov"],
    },
    chaiConfig: {
      truncateThreshold: 0,
      showDiff: true,
      includeStack: true,
    },
  },
});
