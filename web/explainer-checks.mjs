import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

if (!process.env.PREVIEW_URL) throw Error("PREVIEW_URL is required.");
const artifacts = fileURLToPath(
  new URL("../artifacts/explainer/", import.meta.url),
);
await mkdir(artifacts, { recursive: true });
const report = {
  checks: [],
  errors: [],
  screenshots: [],
  started: new Date().toISOString(),
};
const browser = await chromium.launch({
  headless: true,
  args: [
    "--no-sandbox",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
page.setDefaultTimeout(8000);
page.on("pageerror", (error) => report.errors.push(error.message));
page.on("console", (message) => {
  if (message.type() === "error") report.errors.push(message.text());
});
const button = (name) => page.getByRole("button", { name, exact: true });
const snapshot = () =>
  page.evaluate(() => ({
    state: window.__explorer,
    scene: window.__explorerScene,
  }));
const save = () =>
  writeFile(
    path.join(artifacts, "report.json"),
    JSON.stringify(report, null, 2),
  );
const check = async (name, fn) => {
  console.log("START " + name);
  try {
    const evidence = await fn();
    report.checks.push({ name, passed: true, evidence });
    console.log("PASS " + name);
  } catch (error) {
    report.checks.push({ name, passed: false, error: error.message });
    console.log("FAIL " + name + ": " + error.message);
  }
  await save();
};
const settle = async (target = page) => {
  // Wait for the scene's navigation contract, then require the live camera to
  // remain converged. This also covers restored poses and paused orbit damping.
  await target.waitForFunction(
    () => window.__explorerScene?.navigationPhase === "settled",
    undefined,
    { timeout: 8000 },
  );
  await target.evaluate(
    () =>
      new Promise((resolve, reject) => {
        let frame;
        let previous = null;
        let stableSince = null;
        const timeout = setTimeout(() => {
          cancelAnimationFrame(frame);
          reject(new Error("Camera did not converge after navigation settled"));
        }, 8000);
        const observe = (now) => {
          const current = window.__explorerScene;
          const pose = window.__explorer?.camera;
          const coordinates = pose ? [...pose.position, ...pose.target] : null;
          const stable =
            current?.navigationPhase === "settled" &&
            coordinates &&
            previous &&
            coordinates.every(
              (value, axis) =>
                Math.abs(value - previous[axis]) <
                Math.max(
                  1e-9,
                  Math.hypot(
                    ...pose.position.map((v, i) => v - pose.target[i]),
                  ) * 1e-5,
                ),
            );
          stableSince = stable ? (stableSince ?? now) : null;
          previous = coordinates;
          if (stableSince !== null && now - stableSince >= 180) {
            clearTimeout(timeout);
            resolve();
          } else frame = requestAnimationFrame(observe);
        };
        frame = requestAnimationFrame(observe);
      }),
  );
};
const matrices = () =>
  page.evaluate(() => {
    const result = {};
    window.__explorerInspect().scene.traverse((o) => {
      if (o.isMesh && o.userData?.id)
        result[o.userData.id] = [...o.matrixWorld.elements];
    });
    return result;
  });
const capture = async (name) => {
  await page.screenshot({
    path: path.join(artifacts, name + ".png"),
    fullPage: true,
  });
  await page
    .locator(".canvas")
    .screenshot({ path: path.join(artifacts, name + "-scene.png") });
  report.screenshots.push(name);
};
const focus = async (id, label) => {
  await button(label).click();
  await expect.poll(async () => (await snapshot()).scene.normFocus).toBe(id);
  await settle();
  await expect
    .poll(async () => {
      const { state, scene } = await snapshot();
      return Math.hypot(
        ...state.camera.target.map(
          (value, axis) => value - scene.nodes[id].world[axis],
        ),
      );
    })
    .toBeLessThan(1e-5);
  await expect(
    page.getByRole("region", { name: "RMSNorm inspection" }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("table", { name: "Eight-channel RMSNorm calculation" })
      .locator("tbody tr"),
  ).toHaveCount(8);
};
const seek = async (value) => {
  await page
    .getByRole("slider", { name: "Tour position" })
    .evaluate((input, value) => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      ).set.call(input, String(value));
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }, value);
};
try {
  await page.goto(process.env.PREVIEW_URL, { waitUntil: "networkidle" });
  await page.waitForFunction(() => window.__explorer?.ready);
  await settle();
  report.build = (await snapshot()).state.build;
  await check(
    "Desktop navigation is above the model and the explainer is wide",
    async () => {
      for (const name of [
        "Attention heads",
        "Expert feed-forward network",
        "RMSNorm",
      ])
        await expect(
          page
            .getByRole("navigation", { name: "Component views" })
            .getByRole("button", { name, exact: true }),
        ).toBeVisible();
      const nav = await page.locator(".component-nav").boundingBox();
      const model = await page
        .getByRole("region", { name: "Interactive model" })
        .boundingBox();
      const aside = await page
        .getByRole("complementary", { name: "Component explanation" })
        .boundingBox();
      expect(nav.y + nav.height).toBeLessThanOrEqual(model.y + 1);
      expect(aside.width).toBeGreaterThanOrEqual(420);
      expect(aside.x).toBeGreaterThanOrEqual(model.x + model.width - 1);
      return { nav, model, aside };
    },
  );
  await check(
    "Three RMSNorm locations focus actual geometry and expose correct scalar calculations",
    async () => {
      const initial = await matrices();
      await focus("norm1", "RMSNorm");
      const evidence = [];
      for (const [id, label] of [
        ["norm1", "Before attention"],
        ["norm2", "Before experts"],
        ["final_norm", "Final RMSNorm"],
      ]) {
        await focus(id, label);
        expect(await matrices()).toEqual(initial);
        await page
          .getByRole("complementary", { name: "Component explanation" })
          .evaluate((element) => element.scrollTo(0, 0));
        await capture(id + "-operation");
        const rows = await page
          .getByRole("table", { name: "Eight-channel RMSNorm calculation" })
          .locator("tbody tr")
          .evaluateAll((rows) =>
            rows.map((row) =>
              [...row.querySelectorAll("td")].map((cell) =>
                Number(cell.textContent),
              ),
            ),
          );
        const denominator = Math.sqrt(
          rows.reduce((sum, row) => sum + row[0] ** 2, 0) / 8 + 1e-5,
        );
        rows.forEach(([x, squared, gamma, y]) => {
          expect(squared).toBeCloseTo(x * x, 4);
          expect(y).toBeCloseTo((gamma * x) / denominator, 5);
        });
        await button("Inspect activation vector").click();
        await button("Inspect channel 4").click();
        await expect(
          page.getByRole("heading", {
            name: "Channel 4: one activation value",
            exact: true,
          }),
        ).toBeVisible();
        await expect(button("Inspect channel 4")).toHaveAttribute(
          "aria-pressed",
          "true",
        );
        const output = page
          .locator(".rms-calculation div")
          .filter({ has: page.locator("dt", { hasText: "Output yᵢ" }) })
          .locator("dd strong");
        expect(Number(await output.textContent())).toBeCloseTo(
          (rows[3][2] * rows[3][0]) / denominator,
          5,
        );
        await capture(id + "-scalar");
        evidence.push({
          id,
          rows,
          denominator,
          camera: (await snapshot()).state.camera,
        });
      }
      return evidence;
    },
  );
  await check(
    "Final scalar context restores; explicit close, navigation, seek and Reset clear focus",
    async () => {
      if ((await page.locator("details.review").getAttribute("open")) === null)
        await page
          .getByText("Development view context", { exact: true })
          .click();
      await button("Copy current view").click();
      const field = page.getByRole("textbox", { name: "View context" });
      const saved = await field.inputValue();
      const parsed = JSON.parse(saved);
      expect(parsed.inspectedComponent).toBe("final_norm");
      expect(parsed.inspectionDepth).toBe("scalar");
      expect(parsed.inspectionChannel).toBe(3);
      await button("Close RMSNorm inspection").click();
      await expect
        .poll(async () => (await snapshot()).scene.normFocus)
        .toBe(null);
      await field.fill(saved);
      await button("Restore view").click();
      await expect
        .poll(async () => (await snapshot()).scene.normFocus)
        .toBe("final_norm");
      await expect(button("Inspect channel 4")).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      await settle();
      await button("Close RMSNorm inspection").click();
      await focus("final_norm", "RMSNorm");
      await button("Attention heads").click();
      await expect
        .poll(async () => (await snapshot()).scene.normFocus)
        .toBe(null);
      await focus("norm1", "RMSNorm");
      await seek(32);
      await expect
        .poll(async () => (await snapshot()).scene.normFocus)
        .toBe(null);
      await focus("norm1", "RMSNorm");
      await button("Play tour").click();
      await expect
        .poll(async () => (await snapshot()).scene.normFocus)
        .toBe(null);
      await button("Pause tour").click();
      await focus("norm1", "RMSNorm");
      await button("Reset").click();
      await expect
        .poll(async () => (await snapshot()).scene.normFocus)
        .toBe(null);
      return {
        savedComponent: parsed.inspectedComponent,
        depth: parsed.inspectionDepth,
        channel: parsed.inspectionChannel,
      };
    },
  );
  await check(
    "Final RMSNorm can be picked on its actual GLB surface",
    async () => {
      await button("Output & generation").click();
      await settle();
      const before = await snapshot();
      const point = before.scene.nodes.final_norm.screen;
      const canvas = await page.locator("canvas").boundingBox();
      expect(point[0]).toBeGreaterThan(canvas.x);
      expect(point[0]).toBeLessThan(canvas.x + canvas.width);
      expect(point[1]).toBeGreaterThan(canvas.y);
      expect(point[1]).toBeLessThan(canvas.y + canvas.height);
      await page.mouse.click(point[0], point[1]);
      await expect
        .poll(async () => (await snapshot()).scene.normFocus)
        .toBe("final_norm");
      await expect
        .poll(async () => (await snapshot()).scene.lastPick.id)
        .toBe("final_norm");
      await settle();
      await page
        .getByRole("complementary", { name: "Component explanation" })
        .evaluate((element) => element.scrollTo(0, 0));
      await capture("final-norm-mesh-picked");
      await button("Close RMSNorm inspection").click();
      return { screen: point, pick: (await snapshot()).scene.lastPick };
    },
  );
  await check(
    "Changing top-level views returns the explainer to its introduction",
    async () => {
      await button("Reset").click();
      await focus("norm1", "RMSNorm");
      await button("Inspect channel 4").click();
      const aside = page.getByRole("complementary", {
        name: "Component explanation",
      });
      expect(
        await aside.evaluate((element) => element.scrollTop),
      ).toBeGreaterThan(0);
      await button("Attention heads").click();
      await expect
        .poll(() => aside.evaluate((element) => element.scrollTop))
        .toBe(0);
      const panel = await aside.boundingBox();
      const intro = await page.locator(".explanation-intro").boundingBox();
      expect(intro.y).toBeGreaterThanOrEqual(panel.y);
      expect(intro.y + intro.height).toBeLessThanOrEqual(
        panel.y + panel.height,
      );
      return { panel, intro };
    },
  );
  await check(
    "Narrow layout places worked math below the model without page overflow",
    async () => {
      await button("Reset").click();
      await page.setViewportSize({ width: 390, height: 844 });
      await focus("norm1", "RMSNorm");
      await button("Inspect channel 4").click();
      const layout = await page.evaluate(() => ({
        page: document.documentElement.scrollWidth,
        viewport: innerWidth,
        model: document
          .querySelector(".exhibit")
          .getBoundingClientRect()
          .toJSON(),
        panel: document
          .querySelector(".rms-inspection")
          .getBoundingClientRect()
          .toJSON(),
      }));
      expect(layout.page).toBeLessThanOrEqual(layout.viewport);
      expect(layout.panel.y).toBeGreaterThanOrEqual(layout.model.bottom);
      await capture("narrow-rmsnorm");
      return layout;
    },
  );
  await check("No browser errors", async () =>
    expect(report.errors).toEqual([]),
  );
} finally {
  report.finished = new Date().toISOString();
  report.passed = report.checks.every((c) => c.passed);
  await save();
  await browser.close();
}
console.log(
  JSON.stringify(
    {
      build: report.build,
      passed: report.passed,
      checks: report.checks.map(({ name, passed }) => ({ name, passed })),
    },
    null,
    2,
  ),
);
if (!report.passed) process.exitCode = 1;
