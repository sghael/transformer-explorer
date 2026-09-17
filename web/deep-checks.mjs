import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

if (!process.env.PREVIEW_URL)
  throw Error("PREVIEW_URL must identify the running preview.");
const artifacts = fileURLToPath(
  new URL("../artifacts/deep-browser/", import.meta.url),
);
await mkdir(artifacts, { recursive: true });
const report = {
  filter: process.env.DEEP_CHECK_FILTER ?? null,
  checks: [],
  screenshots: [],
  errors: [],
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
const context = await browser.newContext({
  viewport: { width: 1440, height: 1100 },
});
const page = await context.newPage();
page.setDefaultTimeout(10000);
page.on("pageerror", (e) => report.errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") report.errors.push(m.text());
});
const state = () =>
  page.evaluate(() => JSON.parse(JSON.stringify(window.__explorer)));
const scene = () =>
  page.evaluate(() => JSON.parse(JSON.stringify(window.__explorerScene)));
const button = (name) => page.getByRole("button", { name, exact: true });
const settled = async (target = page) => {
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
const view = async (name) => {
  await page.getByLabel("Surroundings", { exact: true }).selectOption("full");
  await button(name).click();
  await settled();
};
const capture = async (name) => {
  await page.screenshot({
    path: path.join(artifacts, name + ".png"),
    fullPage: true,
  });
  report.screenshots.push({ name, state: await state(), scene: await scene() });
};
const captureElement = async (name, locator) => {
  await locator.screenshot({ path: path.join(artifacts, name + ".png") });
  report.screenshots.push({
    name,
    cropped: true,
    state: await state(),
    scene: await scene(),
  });
};
const save = () =>
  writeFile(
    path.join(artifacts, "report.json"),
    JSON.stringify(report, null, 2),
  );
const check = async (name, action) => {
  if (
    process.env.DEEP_CHECK_FILTER &&
    !name.includes(process.env.DEEP_CHECK_FILTER) &&
    name !== "No browser errors"
  )
    return;
  console.log("START " + name);
  report.activeCheck = name;
  await save();
  try {
    const evidence = await action();
    report.checks.push({ name, passed: true, evidence });
    console.log("PASS " + name);
  } catch (e) {
    report.checks.push({
      name,
      passed: false,
      error: e.message,
      scene: await scene().catch(() => null),
    });
    console.log("FAIL " + name + ": " + e.message);
    if (await button("Pause flow").count())
      await button("Pause flow")
        .click()
        .catch(() => {});
  }
  await save();
};
const distance = (pose) =>
  Math.hypot(...pose.position.map((v, i) => v - pose.target[i]));
const identity = (s) => ({
  layer: s.selected.layer,
  group: s.selected.group,
  token: s.selected.token,
  expert: s.selected.expert,
});
const packets = (s) => s.flowPackets.filter((p) => p.visible);
async function copiedContext() {
  const details = page.locator("details.review");
  if ((await details.getAttribute("open")) === null)
    await page.getByText("Development view context", { exact: true }).click();
  await button("Copy current view").click();
  return JSON.parse(
    await page.getByRole("textbox", { name: "View context" }).inputValue(),
  );
}
async function restoreFlow(flowTime) {
  const current = await copiedContext();
  current.flowTime = flowTime;
  current.flowPlaying = false;
  await page
    .getByRole("textbox", { name: "View context" })
    .fill(JSON.stringify(current));
  await button("Restore view").click();
  await settled();
  expect((await scene()).flowTime).toBe(flowTime);
  expect((await scene()).flowPlaying).toBe(false);
}
try {
  await page.goto(process.env.PREVIEW_URL, { waitUntil: "networkidle" });
  await page.waitForFunction(() => window.__explorer?.ready);
  await settled();
  report.build = (await state()).build;
  await check(
    "Component navigation shows the wider layer before entering the next component",
    async () => {
      await view("Attention group");
      const before = await scene();
      await button("Expert routing").click();
      await page.waitForFunction(
        () => window.__explorerScene?.navigationPhase === "aim",
      );
      const wide = await scene();
      expect(wide.presentedView).toBe("router");
      expect(wide.selected.view).toBe("router");
      expect(identity(wide)).toEqual(identity(before));
      expect(distance(wide.camera)).toBeGreaterThan(
        distance(before.camera) * 1.2,
      );
      await capture("navigation-wide-context");
      await settled();
      const after = await scene();
      expect(after.presentedView).toBe("router");
      expect(identity(after)).toEqual(identity(before));
      for (const [id, node] of Object.entries(before.nodes)) {
        for (const snapshot of [wide, after]) {
          expect(
            snapshot.nodes[id].world,
            `${id} fixed world position`,
          ).toEqual(node.world);
          expect(snapshot.nodes[id].scale, `${id} fixed scale`).toEqual(
            node.scale,
          );
          expect(snapshot.nodes[id].visible, `${id} persists`).toBe(
            node.visible,
          );
        }
      }
      await capture("navigation-router-arrival");
      return { before, wide, after };
    },
  );
  await check(
    "Rapid navigation retains the intended router destination instead of an interrupted wide pose",
    async () => {
      await view("Expert routing");
      const destination = await scene();
      await view("Attention group");
      const before = await scene();
      await button("Expert routing").click();
      await page.waitForTimeout(100);
      const interrupted = await scene();
      expect(interrupted.selected.view).toBe("router");
      expect(interrupted.navigationPhase).not.toBe("settled");
      await view("Model overview");
      await view("Expert routing");
      const after = await scene();
      expect(after.presentedView).toBe("router");
      expect(after.selected.view).toBe("router");
      for (const field of ["position", "target"]) {
        after.camera[field].forEach((value, axis) =>
          expect(value).toBeCloseTo(destination.camera[field][axis], 4),
        );
      }
      expect(identity(after)).toEqual(identity(before));
      await capture("rapid-navigation-router-arrival");
      return { before, interrupted, after };
    },
  );
  await check(
    "Animate flow moves packets, Pause freezes them, and Step advances one second",
    async () => {
      await view("Model overview");
      await button("Animate flow").click();
      await page.waitForTimeout(240);
      const moving = await scene();
      expect(moving.flowPlaying).toBe(true);
      expect(packets(moving).length).toBeGreaterThan(0);
      await page.waitForTimeout(260);
      expect(packets(await scene())).not.toEqual(packets(moving));
      const timing = await page.evaluate(
        () =>
          new Promise((resolve) => {
            const timestamps = [];
            const frame = (now) => {
              timestamps.push(now);
              if (timestamps.length < 60) requestAnimationFrame(frame);
              else
                resolve({
                  intervalsMs: timestamps
                    .slice(1)
                    .map((value, index) => value - timestamps[index]),
                  render: window.__explorerRender,
                  flowActive: window.__explorerScene.flowPlaying,
                  viewport: [innerWidth, innerHeight],
                  devicePixelRatio,
                });
            };
            requestAnimationFrame(frame);
          }),
      );
      expect(timing.flowActive).toBe(true);
      timing.meanFrameMs =
        timing.intervalsMs.reduce((sum, value) => sum + value, 0) /
        timing.intervalsMs.length;
      timing.browser = browser.version();
      timing.limitation =
        "Headless Chromium with SwiftShader software rendering; not a representative laptop GPU measurement.";
      await button("Pause flow").click();
      await page.waitForTimeout(120);
      const frozen = await scene();
      await page.waitForTimeout(260);
      const still = await scene();
      expect(still.flowTime).toBe(frozen.flowTime);
      expect(packets(still)).toEqual(packets(frozen));
      await button("Step flow").click();
      await page.waitForTimeout(120);
      const stepped = await scene();
      expect(stepped.flowTime).toBe((frozen.flowTime + 1) % 12);
      expect(stepped.flowPlaying).toBe(false);
      await capture("flow-paused-step");
      return { moving, frozen, stepped, timing };
    },
  );
  await check(
    "Overview flow distinguishes tokens, prefill tensors, hidden vectors, and returning next tokens",
    async () => {
      const evidence = [];
      await view("Model overview");
      for (const [time, kind, name] of [
        [0.8, "token", "flow-token"],
        [2.4, "tensor", "flow-prefill-tensor"],
        [6, "vector", "flow-hidden-vector"],
        [10.8, "token", "flow-new-token-return"],
      ]) {
        await restoreFlow(time);
        const current = await scene();
        expect(packets(current)).toHaveLength(1);
        expect(packets(current)[0].kind).toBe(kind);
        if (time === 10.8) {
          const feedbackY = await page.evaluate(() => {
            const { scene, camera } = window.__explorerInspect();
            let connector;
            scene.traverse((node) => {
              if (node.userData.id === "generation_feedback_segment_0")
                connector = node;
            });
            if (!connector)
              throw Error("Rendered generation feedback connector is missing");
            return connector.getWorldPosition(camera.position.clone()).y;
          });
          expect(packets(current)[0].position[1]).toBeCloseTo(feedbackY, 6);
          await expect(
            page.locator(".flow-controls p").filter({
              hasText: "New token returns · next decode step reuses K/V",
            }),
          ).toBeVisible();
        }
        await capture(name);
        if (time === 10.8)
          await captureElement(
            "flow-new-token-return-canvas",
            page.locator("canvas"),
          );
        evidence.push({ time, packets: packets(current) });
      }
      return evidence;
    },
  );
  await check(
    "Cache flow reads retained rows then appends new K/V without changing earlier values",
    async () => {
      await view("KV cache");
      await restoreFlow(3);
      const read = await scene();
      expect(read.cacheRows).toBe(8);
      expect(packets(read)).toHaveLength(2);
      expect(packets(read).every((p) => p.kind === "vector")).toBe(true);
      await expect(
        page
          .locator(".flow-controls p")
          .filter({ hasText: "Read retained K/V · no prompt recomputation" }),
      ).toBeVisible();
      await capture("flow-cache-read");
      await restoreFlow(9);
      const append = await scene();
      expect(append.cacheRows).toBe(9);
      expect(append.cache.retainedKeys).toEqual(read.cache.retainedKeys);
      expect(append.cache.retainedValues).toEqual(read.cache.retainedValues);
      expect(append.cache.newKey).not.toBeNull();
      expect(append.cache.newValue).not.toBeNull();
      expect(packets(append)).toHaveLength(2);
      await expect(
        page
          .locator(".flow-controls p")
          .filter({ hasText: "Decode: append this token’s new K/V vectors" }),
      ).toBeVisible();
      await capture("flow-cache-append");
      return { read, append };
    },
  );
  await check(
    "Router flow sends two packets through selected experts and combines their output vectors",
    async () => {
      await view("Expert routing");
      await restoreFlow(2.7);
      const input = await scene();
      expect(packets(input)).toHaveLength(2);
      expect(packets(input).every((p) => p.kind === "vector")).toBe(true);
      await expect(
        page
          .locator(".flow-controls p")
          .filter({ hasText: "One activation vector → two selected experts" }),
      ).toBeVisible();
      await capture("flow-router-input");
      await restoreFlow(9);
      const output = await scene();
      expect(packets(output)).toHaveLength(2);
      expect(output.routeExperts).toEqual(input.routeExperts);
      expect(packets(output)).not.toEqual(packets(input));
      await expect(
        page
          .locator(".flow-controls p")
          .filter({ hasText: "Two transformed vectors → weighted sum" }),
      ).toBeVisible();
      await capture("flow-router-output");
      return { input, output };
    },
  );
  await check(
    "Narrow router flow keeps two visible vectors and selected expert labels",
    async () => {
      await button("Reset").click();
      await page.setViewportSize({ width: 390, height: 1000 });
      await button("Expert routing").click();
      await expect
        .poll(async () => (await scene()).selected.view)
        .toBe("router");
      await page.waitForTimeout(150);
      await settled();
      const evidence = [];
      let previous = 0;
      try {
        for (const time of [3, 9]) {
          for (let step = previous; step < time; step++)
            await button("Step flow").click();
          previous = time;
          await expect.poll(async () => (await scene()).flowTime).toBe(time);
          const current = await scene();
          await capture(`flow-router-narrow-${time}`);
          expect(packets(current)).toHaveLength(2);
          expect(
            packets(current).every((packet) => packet.kind === "vector"),
          ).toBe(true);
          const canvas = page.locator(".canvas");
          await expect(
            canvas.getByText("Top 2", {
              exact: true,
            }),
          ).toBeVisible();
          await expect(
            canvas.getByText("Merge", { exact: true }),
          ).toBeVisible();
          for (const expert of current.routeExperts)
            await expect(
              canvas.getByText(`E${expert + 1} ✓`, { exact: true }),
            ).toBeVisible();
          const rows = page.locator(
            ".router-evidence-table tbody tr.selected-row",
          );
          await expect(rows).toHaveCount(2);
          const weights = await rows.locator("td:last-child").allTextContents();
          expect(weights.map(Number).sort()).toEqual(
            current.routeWeights
              .map((value) => Number(value.toFixed(3)))
              .sort(),
          );
          await expect(
            page.getByRole("heading", {
              name: "Two selected expert outputs",
              exact: true,
            }),
          ).toBeVisible();
          evidence.push(current);
        }
        expect(
          packets(evidence[1]).map((packet) => packet.position),
        ).not.toEqual(packets(evidence[0]).map((packet) => packet.position));
        return evidence;
      } finally {
        await page.setViewportSize({ width: 1440, height: 1100 });
      }
    },
  );
  await check(
    "Expert flow remains inside the selected nested expert neighborhood",
    async () => {
      await view("Inside an expert");
      const evidence = [];
      for (const time of [3, 9]) {
        await restoreFlow(time);
        const current = await scene();
        const expert = current.nodes[`expert_${current.selected.expert}`];
        expect(packets(current)).toHaveLength(2);
        for (const packet of packets(current)) {
          expect(packet.kind).toBe("vector");
          const delta = packet.position.map(
            (value, axis) => value - expert.world[axis],
          );
          // Sibling experts are separated in depth; each marker must remain
          // in the selected enclosure's depth interval, not the old full-size diagram.
          expect(Math.abs(delta[2])).toBeLessThan(
            current.nodes.focus.scale[2] * 0.41,
          );
          expect(Math.hypot(...delta)).toBeLessThan(
            current.nodes.focus.scale[0] * 2,
          );
        }
        await capture(`flow-expert-${time}`);
        evidence.push(current);
      }
      expect(packets(evidence[1])).not.toEqual(packets(evidence[0]));
      return evidence;
    },
  );
  await check(
    "RMSNorm inspection exposes a consistent vector-to-scalar calculation",
    async () => {
      await view("Inside a layer");
      await button("Inspect RMSNorm").click();
      const panel = page.getByRole("region", { name: "RMSNorm inspection" });
      await button("Inspect activation vector").click();
      const values = await panel
        .locator(".activation-channels button strong")
        .allTextContents();
      expect(values).toHaveLength(8);
      const inputs = values.map(Number);
      const mean = inputs.reduce((sum, x) => sum + x * x, 0) / 8;
      const cell = (label) =>
        panel
          .locator("dl > div")
          .filter({
            has: page.locator("dt", { hasText: new RegExp("^" + label + "$") }),
          })
          .locator("dd");
      const shownMean = Number(
        await cell("Mean of the eight squared values")
          .locator("strong")
          .textContent(),
      );
      const epsilon = Number(
        await cell("Illustrative stability constant ε").textContent(),
      );
      const denominator = Number(
        await cell("Shared denominator").locator("strong").textContent(),
      );
      expect(shownMean).toBeCloseTo(mean, 5);
      expect(denominator).toBeCloseTo(Math.sqrt(mean + epsilon), 5);
      const scalars = [];
      for (const channel of [1, 4, 8]) {
        await button("Inspect channel " + channel).click();
        const input = Number(await cell("Input xᵢ").textContent());
        const square = Number(await cell("Squared input xᵢ²").textContent());
        const gamma = Number(
          await cell("Illustrative learned scale γᵢ").textContent(),
        );
        const output = Number(
          await cell("Output yᵢ").locator("strong").textContent(),
        );
        expect(input).toBe(inputs[channel - 1]);
        expect(square).toBeCloseTo(input * input, 4);
        expect(output).toBeCloseTo((gamma * input) / denominator, 5);
        scalars.push({ channel, input, square, gamma, output });
      }
      await capture("rmsnorm-scalar-inspection");
      await captureElement("rmsnorm-scalar-panel", panel);
      return { inputs, mean: shownMean, epsilon, denominator, scalars };
    },
  );
  await check(
    "Reduced-motion navigation presents the target without a context animation",
    async () => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.reload({ waitUntil: "networkidle" });
      await page.waitForFunction(() => window.__explorer?.ready);
      await view("Attention group");
      const before = await scene();
      await button("Expert routing").click();
      await page.waitForTimeout(80);
      const after = await scene();
      expect(after.navigationPhase).toBe("settled");
      expect(after.presentedView).toBe("router");
      expect(identity(after)).toEqual(identity(before));
      await capture("reduced-motion-router");
      return { before, after };
    },
  );
  await check("No browser errors", async () => {
    expect(report.errors).toEqual([]);
    return report.errors;
  });
} catch (e) {
  report.checks.push({
    name: "Harness startup",
    passed: false,
    error: e.message,
  });
} finally {
  report.activeCheck = null;
  report.finished = new Date().toISOString();
  report.passed = report.checks.every((c) => c.passed);
  await save();
  await browser.close();
  console.log(
    JSON.stringify(
      {
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
