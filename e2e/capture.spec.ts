import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, renameSync } from "node:fs";
import { join } from "node:path";

/**
 * Walks the main demo flow and records one clean 1440×900 video per screen,
 * plus a still of each, into artifacts/video/captures/. Only the Next.js dev
 * overlay is hidden; the simulation banner and every honest label stay.
 *
 * Needs a fresh demo-mode server (see e2e/playwright.config.ts). The flow
 * changes the demo database, so reset it before re-recording.
 */
const OUT = join(process.cwd(), "artifacts", "video", "captures");
mkdirSync(OUT, { recursive: true });
test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const hide = () => {
      const s = document.createElement("style");
      s.textContent = "nextjs-portal{display:none!important}";
      document.head.appendChild(s);
    };
    if (document.head) hide();
    else document.addEventListener("DOMContentLoaded", hide);
  });
});
test.afterEach(async ({ page }, info) => {
  const video = page.video();
  await page.close();
  if (video) {
    const name = info.title.split(" ")[0];
    try {
      renameSync(await video.path(), join(OUT, `${name}.webm`));
    } catch {
      await video.saveAs(join(OUT, `${name}.webm`));
    }
  }
});

const pause = (page: Page, ms: number) => page.waitForTimeout(ms);
const still = (page: Page, name: string) => page.screenshot({ path: join(OUT, `${name}.png`) });
async function glide(page: Page, y: number, steps = 24) {
  for (let i = 1; i <= steps; i++) {
    await page.mouse.wheel(0, y / steps);
    await pause(page, 30);
  }
}

test("01-start approves the $500 budget on PayPal", async ({ page }) => {
  await page.goto("/start");
  await expect(page.getByRole("heading", { name: "Set up Nebraska" })).toBeVisible();
  await pause(page, 2500);
  await still(page, "01-start");
  await page.getByRole("button", { name: /Approve \$500\.00 on PayPal/ }).click();
  await page.waitForURL(/demo\/approval/);
  await expect(page.getByText("Simulated approval page.")).toBeVisible();
  await pause(page, 2500);
  await still(page, "01b-simulated-approval");
  await page.getByRole("button", { name: "Approve (simulated)" }).click();
  await page.waitForURL(/\/start/);
  await pause(page, 2500);
});

test("02-month shows where the money goes and why", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Going to maintainers")).toBeVisible();
  await pause(page, 2500);
  await still(page, "02-month");
  await glide(page, 420);
  await pause(page, 1500);
  await page.getByRole("button", { name: /fast-xml-parser.*Why this amount/ }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await pause(page, 2500);
  await still(page, "02b-why-this-amount");
  await page.getByRole("dialog").getByText("3. Without AI").scrollIntoViewIfNeeded();
  await pause(page, 3000);
  await page.keyboard.press("Escape");
  await pause(page, 800);
});

test("03-approvals approves the $250 grant on PayPal", async ({ page }) => {
  await page.goto("/approvals");
  await expect(page.getByText("One-time grant for fast-xml-parser").first()).toBeVisible();
  await pause(page, 2500);
  await still(page, "03-approvals");
  await page.getByRole("link", { name: /Approve on PayPal/ }).first().click();
  await page.waitForURL(/demo\/approval/);
  await pause(page, 2000);
  await page.getByRole("button", { name: "Approve (simulated)" }).click();
  await page.waitForURL(/\/approvals/);
  await expect(page.getByText("Approved on PayPal").first()).toBeVisible();
  await pause(page, 2500);
});

test("04-month-end-replay plays the recorded run (fixture)", async ({ page }) => {
  await page.goto("/month-end?replay=fixture&speed=1");
  await expect(page.getByText("Success", { exact: true }).first()).toBeVisible({ timeout: 120_000 });
  await pause(page, 2500);
  await still(page, "04-month-end-replay");
});

test("05-month-end-live runs month-end against the demo API", async ({ page }) => {
  await page.goto("/month-end?data=live&speed=1.5");
  await pause(page, 1500);
  await page.getByRole("button", { name: /^Run month-end$/ }).click();
  await expect(page.getByText("Success", { exact: true }).first()).toBeVisible({ timeout: 120_000 });
  await pause(page, 3000);
  await still(page, "05-month-end-live");
});

test("06-maintainer sees $161.29 plus the $250 grant", async ({ page }) => {
  await page.goto("/maintainer");
  await expect(page.getByText("Earned in November")).toBeVisible();
  await pause(page, 3000);
  await still(page, "06-maintainer");
  await glide(page, 300);
  await pause(page, 2500);
});

test("07-month-end-again shows no second payment", async ({ page }) => {
  await page.goto("/month-end?data=live&speed=3");
  await pause(page, 1200);
  await page.getByRole("button", { name: /^Run month-end$/ }).click();
  await expect(page.getByText("No second payment.")).toBeVisible({ timeout: 120_000 });
  await pause(page, 3500);
  await still(page, "07-month-end-again");
});

test("08-statement shows the recomputable statement", async ({ page }) => {
  await page.goto("/statements/" + new Date().toISOString().slice(0, 7));
  await expect(page.getByText("Recompute hash")).toBeVisible();
  await pause(page, 3000);
  await still(page, "08-statement");
});
