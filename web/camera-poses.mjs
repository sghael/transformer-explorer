// Records the settled camera pose for every view, representative layer and
// group/expert selection at desktop and narrow viewports, plus each tour
// chapter. With CAMERA_BASELINE naming an earlier report, it fails when any
// pose differs by more than 1e-6. CAMERA_SCREENSHOTS also captures each view.
import { chromium } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import chapterData from "../shared/chapters.json" with { type: "json" };

if (!process.env.PREVIEW_URL)
  throw Error("PREVIEW_URL must identify the running preview.");
const artifacts = fileURLToPath(
  new URL("../artifacts/camera-poses/", import.meta.url),
);
await mkdir(artifacts, { recursive: true });
const output = path.join(
  artifacts,
  process.env.CAMERA_REPORT || "camera-poses.json",
);
const views = [
  "overview",
  "input",
  "layer",
  "attention",
  "cache",
  "router",
  "expert",
  "matrix",
  "output",
];
const layers = [0, 15, 31];
const groups = [0, 3, 7];
const experts = [0, 4, 7];
const viewports = [
  { name: "desktop", width: 1440, height: 1100 },
  { name: "narrow", width: 390, height: 844 },
];
const browser = await chromium.launch({
  headless: true,
  args: [
    "--no-sandbox",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
const poses = {};
const errors = [];
const settled = (page) =>
  page.waitForFunction(
    () =>
      new Promise((resolve) => {
        if (window.__explorerScene?.navigationPhase !== "settled")
          return resolve(false);
        const first = JSON.stringify(window.__explorer?.camera);
        requestAnimationFrame(() =>
          requestAnimationFrame(() =>
            resolve(JSON.stringify(window.__explorer?.camera) === first),
          ),
        );
      }),
    undefined,
    { timeout: 10000 },
  );
const record = async (page, key) => {
  await settled(page);
  const { camera, state, time } = await page.evaluate(() =>
    JSON.parse(
      JSON.stringify({
        camera: window.__explorer.camera,
        state: window.__explorer.state,
        time: window.__explorer.time,
      }),
    ),
  );
  poses[key] = { ...camera, state, time };
};
for (const viewport of viewports) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(process.env.PREVIEW_URL);
  await page.waitForFunction(() => window.__explorer?.ready);
  const build = await page.evaluate(() => window.__explorer.build);
  const details = page.locator("details.review");
  if ((await details.getAttribute("open")) === null)
    await page.getByText("Development view context", { exact: true }).click();
  const field = page.getByRole("textbox", { name: "View context" });
  const restore = async (state) => {
    // layoutVersion 1 carries no restorable camera, so the viewer frames the
    // restored view itself: exactly the pose under test.
    await field.fill(
      JSON.stringify({
        build,
        layoutVersion: 1,
        state: { token: 6, spacing: 1, ...state },
        time: 0,
        decode: false,
        flowTime: 0,
        flowPlaying: false,
        inspectedComponent: null,
        inspectionDepth: "operation",
        inspectionChannel: 0,
        lowQuality: false,
        contextMode: "muted",
        speed: 1,
        matrixOrigin: "attention",
        camera: { position: [0, 0, 10], target: [0, 0, 0] },
      }),
    );
    await page
      .getByRole("button", { name: "Restore view", exact: true })
      .click();
  };
  for (const view of views)
    for (const layer of layers)
      for (const group of groups)
        for (const expert of experts) {
          await restore({ view, layer, group, expert });
          // Sample only after a rendered frame has received the restored state.
          await page.waitForFunction(
            (want) =>
              Object.entries(want).every(
                ([key, value]) =>
                  window.__explorer?.state[key] === value &&
                  window.__explorerScene?.selected[key] === value,
              ),
            { view, layer, group, expert },
          );
          await record(
            page,
            `${viewport.name}/${view}/layer${layer}/group${group}/expert${expert}`,
          );
          // One capture per view at the Middle layer, for visual inspection.
          if (
            process.env.CAMERA_SCREENSHOTS &&
            layer === 15 &&
            group === 3 &&
            expert === 4
          )
            await page.locator("canvas").screenshot({
              path: path.join(artifacts, `${viewport.name}-${view}.png`),
            });
        }
  const slider = page.getByRole("slider", { name: "Tour position" });
  for (const chapter of chapterData.chapters)
    for (const time of [
      chapter.start + 0.5,
      (chapter.start + chapter.end) / 2,
    ]) {
      await slider.evaluate((input, next) => {
        const setter = Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          "value",
        ).set;
        setter.call(input, String(next));
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }, time);
      await page.waitForFunction(
        (t) =>
          window.__explorer.time === t &&
          window.__explorerScene?.time === Math.floor(t),
        time,
      );
      await record(page, `${viewport.name}/tour/${chapter.id}/${time}`);
    }
  await context.close();
}
await browser.close();
await writeFile(output, JSON.stringify({ poses, errors }, null, 2));
console.log(`${Object.keys(poses).length} poses → ${output}`);
if (errors.length) throw Error(`Browser errors: ${errors.join("; ")}`);
if (process.env.CAMERA_BASELINE) {
  const baseline = JSON.parse(
    await readFile(process.env.CAMERA_BASELINE),
  ).poses;
  let worst = 0;
  const failures = [];
  for (const [key, expected] of Object.entries(baseline)) {
    const actual = poses[key];
    if (!actual) {
      failures.push(`${key}: missing`);
      continue;
    }
    const difference = Math.max(
      ...["position", "target"].flatMap((part) =>
        expected[part].map((v, i) => Math.abs(v - actual[part][i])),
      ),
    );
    worst = Math.max(worst, difference);
    if (difference > 1e-6) failures.push(`${key}: ${difference}`);
    if (JSON.stringify(expected.state) !== JSON.stringify(actual.state))
      failures.push(`${key}: state differs`);
  }
  console.log(
    `Compared ${Object.keys(baseline).length} poses; largest difference ${worst}`,
  );
  if (failures.length) throw Error(failures.join("\n"));
}
