import { defineConfig } from "@playwright/test";

/**
 * Screen capture for the demo video. Start a fresh demo server first:
 *   rm -f data/demo.db* && npm run build && npm start
 * then: npm run capture
 * Videos and screenshots land in artifacts/video/captures/.
 */
export default defineConfig({
  testDir: ".",
  testMatch: /capture\.spec\.ts$/,
  outputDir: "../artifacts/video/captures/.raw",
  fullyParallel: false,
  workers: 1,
  timeout: 180_000,
  reporter: [["list"]],
  use: {
    baseURL: process.env.NEBRASKA_BASE_URL ?? "http://localhost:3000",
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    video: { mode: "on", size: { width: 1440, height: 900 } },
    trace: "off",
    colorScheme: "light",
  },
});
