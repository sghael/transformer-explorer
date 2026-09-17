import { chromium, expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";
if (!process.env.PREVIEW_URL) throw Error("Set PREVIEW_URL");
const browser = await chromium.launch({
  args: [
    "--no-sandbox",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
try {
  await page.goto(process.env.PREVIEW_URL);
  await page.waitForFunction(() => window.__explorer?.ready);
  await page.waitForTimeout(1200);
  const canvas = await page.locator("canvas").boundingBox();
  await page.mouse.move(
    canvas.x + canvas.width * 0.5,
    canvas.y + canvas.height * 0.5,
  );
  for (const [delta, view] of [
    [-2500, "layer"],
    [-2500, "attention"],
    [2500, "layer"],
    [2500, "overview"],
  ]) {
    for (let step = 0; step < 45; step++) {
      await page.mouse.wheel(0, delta);
      await page.waitForTimeout(35);
      if ((await page.evaluate(() => window.__explorer.state.view)) === view)
        break;
    }
    await expect
      .poll(() => page.evaluate(() => window.__explorer.state.view))
      .toBe(view);
    await page.waitForTimeout(1200);
  }
  const state = await page.evaluate(() => window.__explorer.state);
  expect(state.layer).toBe(11);
  expect(state.group).toBe(2);
  expect(state.token).toBe(4);
  await page
    .getByRole("button", { name: "Expert routing", exact: true })
    .click();
  await page.waitForTimeout(1200);
  await page.screenshot({
    path: new URL("../artifacts/browser/final-router.png", import.meta.url)
      .pathname,
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Read attention matrix", exact: true })
    .click();
  await page.waitForTimeout(1200);
  await page.screenshot({
    path: new URL("../artifacts/browser/final-matrix.png", import.meta.url)
      .pathname,
    fullPage: true,
  });
  const report = await page.evaluate(() => ({
    build: window.__explorer.build,
    passed: true,
    state: window.__explorer.state,
    render: window.__explorerRender,
  }));
  await writeFile(
    new URL("../artifacts/browser/semantic-report.json", import.meta.url),
    JSON.stringify(report, null, 2),
  );
  console.log(report);
} finally {
  await browser.close();
}
