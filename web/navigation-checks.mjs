import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

if (!process.env.PREVIEW_URL)
  throw Error("PREVIEW_URL must identify the running preview.");
const artifacts = fileURLToPath(
  new URL("../artifacts/navigation-browser/", import.meta.url),
);
await mkdir(artifacts, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  args: [
    "--no-sandbox",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 1100 },
  recordVideo: {
    dir: path.join(artifacts, "video"),
    size: { width: 1440, height: 1100 },
  },
});
const page = await context.newPage();
page.setDefaultTimeout(10000);
const report = {
  started: new Date().toISOString(),
  checks: [],
  errors: [],
  traces: [],
  screenshots: [],
};
page.on("pageerror", (e) => report.errors.push(e.message));
const button = (name) => page.getByRole("button", { name, exact: true });
const scene = () =>
  page.evaluate(() => JSON.parse(JSON.stringify(window.__explorerScene)));
const save = () =>
  writeFile(
    path.join(artifacts, "report.json"),
    JSON.stringify(report, null, 2),
  );
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
const shot = async (name) => {
  await page
    .locator("canvas")
    .screenshot({ path: path.join(artifacts, name + ".png") });
  report.screenshots.push({ name, scene: await scene() });
};
const distance = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));
const seek = async (time) => {
  await page
    .getByRole("slider", { name: "Tour position" })
    .evaluate((input, value) => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      ).set.call(input, String(value));
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }, time);
};
try {
  await page.goto(process.env.PREVIEW_URL, { waitUntil: "networkidle" });
  await page.waitForFunction(() => window.__explorer?.ready);
  await settle();
  report.build = await page.evaluate(() => window.__explorer.build);
  for (const interruption of [
    "seek-zoom-out",
    "seek-aim",
    "seek-inbound",
    "reset-aim",
    "restore-inbound",
  ]) {
    console.log("START " + interruption);
    try {
      // Start with a different slider value so the synthetic input dispatches a
      // real React change, even when the preceding case also sought to 22 s.
      await button("Reset").click();
      await page
        .getByLabel("Surroundings", { exact: true })
        .selectOption("full");
      await settle();
      await button("Attention group").click();
      await settle();
      let saved;
      if (interruption === "restore-inbound") {
        if (!(await button("Copy current view").isVisible()))
          await page
            .getByText("Development view context", { exact: true })
            .click();
        await button("Copy current view").click();
        saved = await page
          .getByRole("textbox", { name: "View context" })
          .inputValue();
      }
      await button("Expert routing").click();
      const phase = interruption.endsWith("inbound")
        ? "zoom-in"
        : interruption === "seek-zoom-out"
          ? "zoom-out"
          : "aim";
      await page.waitForFunction(
        (phase) => window.__explorerScene.navigationPhase === phase,
        phase,
      );
      if (phase === "zoom-in") await page.waitForTimeout(350);
      expect((await scene()).navigationPhase).toBe(phase);
      const interrupted = await scene();
      for (const [id, node] of Object.entries(interrupted.nodes)) {
        expect(node.visible, `${id} remains visible during flight`).toBe(true);
        expect(node.opacity, `${id} remains opaque during flight`).toBe(1);
      }
      if (interruption === "reset-aim") {
        await button("Reset").click();
        await page
          .getByLabel("Surroundings", { exact: true })
          .selectOption("full");
      } else if (interruption === "restore-inbound") {
        await page.getByRole("textbox", { name: "View context" }).fill(saved);
        await button("Restore view").click();
      } else await seek(22);
      await settle();
      const after = await scene();
      expect(after.navigationPhase).toBe("settled");
      const destination =
        interruption === "reset-aim"
          ? "overview"
          : interruption === "restore-inbound"
            ? "attention"
            : "layer";
      expect(after.presentedView).toBe(destination);
      expect(after.selected.view).toBe(destination);
      for (const [id, node] of Object.entries(after.nodes)) {
        expect(node.visible, `${id} remains present after cancellation`).toBe(
          true,
        );
        expect(node.opacity, `${id} remains opaque after cancellation`).toBe(1);
      }
      if (saved) {
        const restored = JSON.parse(saved);
        for (const field of ["position", "target"])
          after.camera[field].forEach((value, axis) =>
            expect(value).toBeCloseTo(restored.camera[field][axis], 5),
          );
        for (const field of ["layer", "group", "token", "expert"])
          expect(after.selected[field]).toBe(restored.state[field]);
      }
      await page.waitForTimeout(300);
      expect(
        distance((await scene()).camera.position, after.camera.position),
      ).toBeLessThan(
        distance(after.camera.position, after.camera.target) * 1e-4,
      );
      await shot(interruption + "-settled");
      report.checks.push({
        name: interruption + ": cancellation restores a complete settled scene",
        passed: true,
        evidence: { interrupted, after },
      });
      console.log("PASS " + interruption);
    } catch (error) {
      report.checks.push({
        name: interruption + ": cancellation restores a complete settled scene",
        passed: false,
        error: error.message,
        scene: await scene(),
      });
      console.log("FAIL " + interruption + ": " + error.message);
    }
    await save();
  }
  try {
    const evidence = [];
    for (const mode of ["overview-arrival", "same-view-seek"]) {
      await button("Attention group").click();
      await settle();
      await button(
        mode === "overview-arrival" ? "Model overview" : "Inside a layer",
      ).click();
      await settle();
      if (mode === "same-view-seek") {
        await seek(22);
        await settle();
      }
      const before = await scene();
      const canvas = await page.locator("canvas").boundingBox();
      await page.mouse.move(
        canvas.x + canvas.width * 0.82,
        canvas.y + canvas.height * 0.72,
      );
      await page.mouse.down();
      await page.mouse.move(
        canvas.x + canvas.width * 0.66,
        canvas.y + canvas.height * 0.55,
        { steps: 8 },
      );
      await page.mouse.up();
      await page.waitForTimeout(150);
      const after = await scene();
      expect(
        distance(before.camera.position, after.camera.position),
        mode + " must return camera ownership to OrbitControls",
      ).toBeGreaterThan(
        distance(before.camera.position, before.camera.target) * 0.05,
      );
      expect(after.selected.view).toBe(before.selected.view);
      evidence.push({ mode, before, after });
      await shot(mode + "-orbit");
    }
    report.checks.push({
      name: "Orbit remains available after overview arrival and same-view seeking",
      passed: true,
      evidence,
    });
  } catch (error) {
    report.checks.push({
      name: "Orbit remains available after overview arrival and same-view seeking",
      passed: false,
      error: error.message,
      scene: await scene(),
    });
  }
  report.checks.push({
    name: "No runtime errors",
    passed: report.errors.length === 0,
    evidence: report.errors,
  });
} catch (e) {
  report.checks.push({
    name: "Harness execution",
    passed: false,
    error: e.message,
  });
} finally {
  report.finished = new Date().toISOString();
  report.passed = report.checks.every((c) => c.passed);
  report.video = await page.video()?.path();
  await context.close();
  await browser.close();
  await save();
  console.log(
    JSON.stringify(
      {
        build: report.build,
        passed: report.passed,
        checks: report.checks.map(({ name, passed, error }) => ({
          name,
          passed,
          error,
        })),
      },
      null,
      2,
    ),
  );
  if (!report.passed) process.exitCode = 1;
}
