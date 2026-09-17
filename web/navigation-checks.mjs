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
              (value, axis) => Math.abs(value - previous[axis]) < 0.0001,
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
const visible = (node) => node?.visible && (node.opacity ?? 1) > 0.1;
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
const pairs = [
  {
    id: "overview-layer",
    from: "Model overview",
    to: "Inside a layer",
    target: "layer",
    context: "overview",
    landmark: "layer_11",
    incoming: "router",
  },
  {
    id: "attention-router",
    from: "Attention group",
    to: "Expert routing",
    target: "router",
    landmark: "q_8",
    incoming: "router",
  },
  {
    id: "layer-attention",
    from: "Inside a layer",
    to: "Attention group",
    target: "attention",
    landmark: "router",
    incoming: "q_8",
  },
  {
    id: "attention-matrix",
    from: "Attention group",
    to: "Read attention matrix",
    target: "matrix",
    landmark: "k_2",
    incoming: "score_2",
  },
];
try {
  await page.goto(process.env.PREVIEW_URL, { waitUntil: "networkidle" });
  await page.waitForFunction(() => window.__explorer?.ready);
  await settle();
  report.build = await page.evaluate(() => window.__explorer.build);
  // Inspect the actual loaded GLB so structural parents are distinguished from
  // rendered meshes. A hidden subtree may normalize internal material flags
  // without changing its appearance; visible mesh appearance must stay fixed.
  const meshIds = new Set(
    await page.evaluate(async () => {
      const resource = performance
        .getEntriesByType("resource")
        .find((entry) => /\.glb(?:[?#]|$)/.test(entry.name));
      if (!resource) throw Error("Loaded GLB resource was not recorded");
      const bytes = await (await fetch(resource.name)).arrayBuffer();
      const length = new DataView(bytes).getUint32(12, true);
      const gltf = JSON.parse(
        new TextDecoder().decode(new Uint8Array(bytes, 20, length)),
      );
      return gltf.nodes
        .filter((node) => node.mesh !== undefined)
        .map((node) => node.extras?.id ?? node.name);
    }),
  );
  expect(meshIds.size).toBeGreaterThan(32);
  for (const pair of pairs) {
    console.log("START " + pair.id);
    await button(pair.from).click();
    await settle();
    await shot(pair.id + "-before");
    await page.evaluate(() => {
      window.__navigationTrace = [];
      window.__navigationTraceDone = false;
      const started = performance.now();
      let active = false,
        settledAt = null;
      const tick = (now) => {
        const s = window.__explorerScene;
        if (s) {
          if (s.navigationPhase !== "settled") active = true;
          if (active && s.navigationPhase === "settled" && settledAt === null)
            settledAt = now;
          window.__navigationTrace.push({
            elapsedMs: now - started,
            phase: s.navigationPhase,
            navigationElapsed: s.navigationElapsed,
            presentedView: s.presentedView,
            selected: s.selected,
            camera: s.camera,
            nodes: s.nodes,
          });
        }
        if (
          now - started > 6000 ||
          (settledAt !== null && now - settledAt > 250)
        ) {
          window.__navigationTraceDone = true;
          return;
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }, pair);
    await button(pair.to).click();
    await page.waitForFunction(
      (expected) =>
        window.__explorerScene.navigationPhase === "context" &&
        window.__explorerScene.presentedView === expected,
      pair.context ?? "layer",
    );
    await shot(pair.id + "-context");
    await page.waitForFunction(
      () => window.__explorerScene.navigationPhase === "zoom-in",
    );
    await shot(pair.id + "-initial-zoom-in");
    await page.waitForFunction(() => window.__navigationTraceDone);
    await shot(pair.id + "-arrival");
    const trace = await page.evaluate(() => window.__navigationTrace);
    const incomingFrames = trace.filter((f) => f.phase === "zoom-in");
    const firstIn = incomingFrames[0]?.elapsedMs;
    const early = incomingFrames.filter((f) => f.elapsedMs - firstIn <= 300);
    const contextFrames = trace.filter(
      (f) =>
        f.phase === "context" && f.presentedView === (pair.context ?? "layer"),
    );
    const arrivalFrames = trace.filter(
      (f) => f.phase === "settled" && f.elapsedMs > firstIn,
    );
    const fixedFrames = [...incomingFrames, ...arrivalFrames];
    const sameNode = (a, b, id) => {
      if (
        !a ||
        !b ||
        distance(a.world, b.world) >= 0.00001 ||
        distance(a.scale, b.scale) >= 0.00001 ||
        distance(a.position, b.position) >= 0.00001
      )
        return false;
      if (!meshIds.has(id)) return true;
      const renderedA = a.visible && a.opacity > 0.000001;
      const renderedB = b.visible && b.opacity > 0.000001;
      return (
        renderedA === renderedB &&
        (!renderedA || Math.abs(a.opacity - b.opacity) < 0.00001)
      );
    };
    const changedContextIds = Object.keys(contextFrames[0]?.nodes ?? {}).filter(
      (id) =>
        contextFrames.some(
          (frame) => !sameNode(frame.nodes[id], contextFrames[0].nodes[id], id),
        ),
    );
    const losses = [];
    for (let i = 1; i < trace.length; i++) {
      const old = trace[i - 1],
        next = trace[i];
      if (
        visible(old.nodes[pair.landmark]) &&
        !visible(next.nodes[pair.landmark])
      )
        losses.push({
          elapsedMs: next.elapsedMs,
          phase: next.phase,
          cameraStep: distance(old.camera.position, next.camera.position),
          landmark: pair.landmark,
        });
    }
    const steps = trace.slice(1).map((frame, i) => ({
      dt: frame.elapsedMs - trace[i].elapsedMs,
      distance: distance(frame.camera.position, trace[i].camera.position),
    }));
    const evidence = {
      pair,
      frameCount: trace.length,
      durationMs: trace.at(-1).elapsedMs,
      zoomInMs: incomingFrames.at(-1)?.elapsedMs - firstIn,
      contextFrames: contextFrames.length,
      changedContextIds,
      earlyZoomIn: early.map((f) => ({
        elapsedMs: f.elapsedMs,
        presentedView: f.presentedView,
        landmark: f.nodes[pair.landmark],
        incoming: f.nodes[pair.incoming],
      })),
      visibilityLosses: losses,
      maxCameraStep: Math.max(...steps.map((s) => s.distance)),
      maxCameraSpeed: Math.max(
        ...steps.filter((s) => s.dt > 0).map((s) => (s.distance / s.dt) * 1000),
      ),
    };
    report.traces.push({ pair: pair.id, frames: trace });
    const assertions = [
      [
        "Layout changes while the camera holds the wide context view",
        () => {
          expect(contextFrames.length).toBeGreaterThan(2);
          expect(changedContextIds.length).toBeGreaterThan(0);
          const wide = contextFrames[0].camera;
          expect(distance(wide.position, wide.target)).toBeGreaterThan(20);
          for (const frame of contextFrames) {
            expect(distance(frame.camera.position, wide.position)).toBeLessThan(
              0.00001,
            );
            expect(distance(frame.camera.target, wide.target)).toBeLessThan(
              0.00001,
            );
          }
        },
      ],
      [
        "Destination geometry and opacity remain fixed through inward flight and arrival",
        () => {
          expect(incomingFrames.length).toBeGreaterThan(2);
          expect(arrivalFrames.length).toBeGreaterThan(0);
          const baseline = incomingFrames[0];
          for (const frame of fixedFrames) {
            expect(frame.presentedView).toBe(pair.target);
            for (const id of Object.keys(baseline.nodes))
              expect(
                sameNode(frame.nodes[id], baseline.nodes[id], id),
                `${id} changed during ${frame.phase} at ${frame.navigationElapsed.toFixed(3)}s`,
              ).toBe(true);
          }
        },
      ],
      [
        "Inward camera travel keeps a fixed target and follows one straight approach",
        () => {
          const start = incomingFrames[0].camera,
            end = incomingFrames.at(-1).camera;
          const direction = end.position.map(
            (value, axis) => value - start.position[axis],
          );
          const length = Math.hypot(...direction);
          expect(length).toBeGreaterThan(0.5);
          for (const frame of incomingFrames) {
            expect(distance(frame.camera.target, start.target)).toBeLessThan(
              0.00001,
            );
            const relative = frame.camera.position.map(
              (value, axis) => value - start.position[axis],
            );
            const along =
              relative.reduce(
                (sum, value, axis) => sum + value * direction[axis],
                0,
              ) / length;
            const offset = relative.map(
              (value, axis) => value - (along * direction[axis]) / length,
            );
            expect(Math.hypot(...offset)).toBeLessThan(0.00001);
          }
          expect(
            incomingFrames.at(-1).navigationElapsed -
              incomingFrames[0].navigationElapsed,
          ).toBeGreaterThan(1.1);
          expect(trace.some((frame) => frame.phase === "aim")).toBe(true);
        },
      ],
      [
        "Incoming component remains recognizable throughout zoom-in",
        () => {
          expect(incomingFrames.length).toBeGreaterThan(0);
          for (const frame of incomingFrames)
            expect(
              visible(frame.nodes[pair.incoming]),
              `${pair.incoming} invisible at ${frame.elapsedMs.toFixed(1)}ms`,
            ).toBe(true);
        },
      ],
      [
        "Target and semantic selection remain stable",
        () => {
          expect(trace.at(-1).presentedView).toBe(pair.target);
          const identity = (f) => [
            f.selected.layer,
            f.selected.group,
            f.selected.token,
            f.selected.expert,
          ];
          expect(identity(trace.at(-1))).toEqual(identity(trace[0]));
        },
      ],
    ];
    for (const [name, assertion] of assertions) {
      try {
        assertion();
        report.checks.push({
          name: pair.id + ": " + name,
          passed: true,
          evidence,
        });
        console.log("PASS " + pair.id + ": " + name);
      } catch (e) {
        report.checks.push({
          name: pair.id + ": " + name,
          passed: false,
          error: e.message,
          evidence,
        });
        console.log("FAIL " + pair.id + ": " + e.message);
      }
    }
    await save();
  }
  for (const interruption of [
    "seek-context",
    "seek-mid-blend",
    "seek-inbound",
    "reset-context",
  ]) {
    console.log("START " + interruption);
    try {
      // Start with a different slider value so the synthetic input dispatches a
      // real React change, even when the preceding case also sought to 22 s.
      await button("Reset").click();
      await settle();
      await button("Attention group").click();
      await settle();
      await button("Expert routing").click();
      await page.waitForFunction(
        () =>
          window.__explorerScene.navigationPhase === "context" &&
          window.__explorerScene.presentedView === "layer",
      );
      if (interruption === "seek-mid-blend") {
        await page.waitForFunction(() => {
          const s = window.__explorerScene;
          return (
            s.navigationPhase === "context" &&
            s.nodes.q_8.opacity > 0.15 &&
            s.nodes.q_8.opacity < 0.85
          );
        });
      }
      if (interruption === "seek-inbound") {
        await page.waitForFunction(
          () => window.__explorerScene.navigationPhase === "zoom-in",
        );
        await page.waitForTimeout(350);
        expect((await scene()).navigationPhase).toBe("zoom-in");
      }
      const interrupted = await scene();
      if (interruption === "reset-context") await button("Reset").click();
      else await seek(22);
      await settle();
      const after = await scene();
      expect(after.navigationPhase).toBe("settled");
      const reset = interruption === "reset-context";
      expect(after.presentedView).toBe(reset ? "overview" : "layer");
      expect(after.selected.view).toBe(reset ? "overview" : "layer");
      const opaque = reset
        ? ["layer_0", "layer_31", "input", "embedding", "lm_head"]
        : ["q_8", "k_2", "router"];
      for (const id of opaque) {
        expect(
          visible(after.nodes[id]),
          id + " must be visible after interruption",
        ).toBe(true);
        expect(
          after.nodes[id].opacity,
          id + " must restore full opacity",
        ).toBeCloseTo(1, 6);
      }
      for (const id of reset
        ? ["q_8", "router", "score_2", "expert_detail"]
        : ["input", "score_2", "cache_k_2", "expert_detail"]) {
        expect(
          after.nodes[id].visible,
          id + " must not survive as invalid blended geometry",
        ).toBe(false);
      }
      await page.waitForTimeout(300);
      expect(
        distance((await scene()).camera.position, after.camera.position),
      ).toBeLessThan(0.001);
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
      ).toBeGreaterThan(0.1);
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
