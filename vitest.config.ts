import { configDefaults, defineConfig } from "vitest/config";

// e2e/ holds Playwright browser specs (run with `npm run capture`), not unit tests.
export default defineConfig({
  test: { exclude: [...configDefaults.exclude, "e2e/**"] },
});
