import { chromium } from "@playwright/test";
import fs from "node:fs";
const browser = await chromium.launch({
  headless: true,
  args: [
    "--no-sandbox",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(process.env.PREVIEW_URL);
await page.waitForFunction(() => window.__explorer?.ready);
await page.waitForTimeout(2000);
const output = new URL("../artifacts/browser/", import.meta.url);
fs.mkdirSync(output, { recursive: true });
await page.screenshot({
  path: new URL("overview.png", output).pathname,
  fullPage: true,
});
await page
  .getByRole("button", { name: "Select layer 12", exact: true })
  .click();
await page.waitForTimeout(1800);
await page.screenshot({
  path: new URL("layer.png", output).pathname,
  fullPage: true,
});
await page
  .getByRole("button", { name: "Attention group", exact: true })
  .click();
await page.waitForTimeout(1800);
await page.screenshot({
  path: new URL("attention.png", output).pathname,
  fullPage: true,
});
console.log(
  JSON.stringify({
    errors,
    scene: await page.evaluate(() => window.__explorer),
    render: await page.evaluate(() => window.__explorerRender),
  }),
);
await browser.close();
