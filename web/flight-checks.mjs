import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

if (!process.env.PREVIEW_URL) throw Error("PREVIEW_URL is required");
const output =
  process.env.FLIGHT_ARTIFACTS ??
  fileURLToPath(new URL("../artifacts/flight-browser/", import.meta.url));
await mkdir(output, { recursive: true });
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
    dir: path.join(output, "video"),
    size: { width: 1440, height: 1100 },
  },
});
const page = await context.newPage();
page.setDefaultTimeout(15000);
const report = { build: null, checks: [], routes: [], errors: [] };
page.on("pageerror", (error) => report.errors.push(error.message));
const save = () =>
  writeFile(
    path.join(output, "report.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
const check = (name, passed, evidence) =>
  report.checks.push({ name, passed, evidence });
const distance = (a, b) => Math.hypot(...a.map((value, i) => value - b[i]));
const names = {
  overview: "Model overview",
  layer: "Inside a layer",
  attention: "Attention group",
  matrix: "Read attention matrix",
  router: "Expert routing",
  expert: "Inside an expert",
  output: "Output & generation",
};
try {
  await page.goto(process.env.PREVIEW_URL, { waitUntil: "networkidle" });
  await page.waitForFunction(() => window.__explorer?.ready);
  await page
    .getByRole("combobox", { name: "Surroundings" })
    .selectOption("full");
  await page.waitForTimeout(150);
  report.build = await page.evaluate(() => window.__explorer.build);
  await page.evaluate(() => {
    const root = window.__explorerInspect?.();
    if (
      !root?.camera?.isPerspectiveCamera ||
      root.gl.domElement !== document.querySelector("canvas")
    )
      throw Error("Actual renderer inspection hook required");
    const visible = (o) => {
      for (let a = o; a; a = a.parent) if (!a.visible) return false;
      return true;
    };
    window.__flightSnapshot = () => {
      root.scene.updateMatrixWorld(true);
      const nodes = {},
        opacity = [];
      root.scene.traverse((o) => {
        if (!o.userData?.id) return;
        nodes[o.userData.id] = {
          matrix: [...o.matrixWorld.elements],
          visible: visible(o),
          component: o.userData.component,
        };
        const materials = o.material
          ? Array.isArray(o.material)
            ? o.material
            : [o.material]
          : [];
        for (const m of materials)
          if (Math.abs(m.opacity - 1) > 1e-8)
            opacity.push({ id: o.userData.id, opacity: m.opacity });
      });
      return {
        camera: root.camera.position.toArray(),
        quaternion: root.camera.quaternion.toArray(),
        target: window.__explorerScene.camera.target,
        phase: window.__explorerScene.navigationPhase,
        nodes,
        opacity,
      };
    };
  });
  await page.waitForTimeout(1800);
  await page
    .locator("canvas")
    .screenshot({ path: path.join(output, "overview-initial.png") });
  const initialWorld = await page.evaluate(() => window.__flightSnapshot());
  check(
    "all eight expert interiors physically exist before navigation",
    Array.from({ length: 8 }, (_, e) => [
      `expert_detail_${e}`,
      `gate_${e}`,
      `up_${e}`,
      `down_${e}`,
    ])
      .flat()
      .every((id) => initialWorld.nodes[id]?.visible),
  );
  const journey = [
    "overview",
    "layer",
    "attention",
    "matrix",
    "attention",
    "layer",
    "overview",
    "router",
    "expert",
    "output",
  ];
  for (let i = 1; i < journey.length; i++) {
    const from = journey[i - 1],
      to = journey[i],
      id = `${from}-${to}`;
    console.log("START " + id);
    await page.evaluate(() => {
      const initial = window.__flightSnapshot();
      window.__flightInitial = initial;
      window.__flightFrames = [];
      window.__flightDone = false;
      const began = performance.now();
      let active = false,
        settledAt = null;
      const tracked = [
        "focus",
        "representative_layer",
        "q_8",
        "k_2",
        "score_2",
        "router",
        "expert_0",
        "expert_detail_0",
        "gate_0",
        "up_0",
        "down_0",
        "cache_k_2",
      ];
      const tick = (now) => {
        const sample = window.__flightSnapshot();
        if (sample.phase !== "settled") active = true;
        if (active && sample.phase === "settled" && settledAt === null)
          settledAt = now;
        let maxMatrixDelta = 0,
          changedCount = 0,
          visibilityChanges = 0;
        const changed = [];
        for (const [id, node] of Object.entries(sample.nodes)) {
          const old = initial.nodes[id];
          if (!old) {
            changedCount++;
            continue;
          }
          const delta = Math.max(
            ...node.matrix.map((v, i) => Math.abs(v - old.matrix[i])),
          );
          maxMatrixDelta = Math.max(maxMatrixDelta, delta);
          if (delta > 1e-7) {
            changedCount++;
            if (changed.length < 8) changed.push(id);
          }
          if (node.visible !== old.visible) visibilityChanges++;
        }
        const compact = Object.fromEntries(
          tracked
            .filter((id) => sample.nodes[id])
            .map((id) => [id, sample.nodes[id]]),
        );
        window.__flightFrames.push({
          elapsed: now - began,
          camera: sample.camera,
          quaternion: sample.quaternion,
          target: sample.target,
          phase: sample.phase,
          nodes: compact,
          opacity: sample.opacity,
          maxMatrixDelta,
          changedCount,
          visibilityChanges,
          changed,
        });
        if (
          (settledAt !== null && now - settledAt > 200) ||
          now - began > 7000
        ) {
          window.__flightDone = true;
          return;
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    await page.getByRole("button", { name: names[to], exact: true }).click();
    await page.waitForTimeout(650);
    await page
      .locator("canvas")
      .screenshot({ path: path.join(output, `${id}-flight.png`) });
    await page.waitForFunction(() => window.__flightDone);
    await page
      .locator("canvas")
      .screenshot({ path: path.join(output, `${id}-arrival.png`) });
    const { initial, frames } = await page.evaluate(() => ({
      initial: window.__flightInitial,
      frames: window.__flightFrames,
    }));
    const final = frames.at(-1),
      duration = final.elapsed;
    const maxMatrixDelta = Math.max(...frames.map((f) => f.maxMatrixDelta));
    check(id + ": fixed GLB world transforms", maxMatrixDelta < 1e-7, {
      maxMatrixDelta,
      changed: frames.find((f) => f.changedCount)?.changed,
    });
    check(
      id + ": no GLB material crossfade",
      frames.every((f) => !f.opacity.length),
      { first: frames.find((f) => f.opacity.length)?.opacity.slice(0, 6) },
    );
    check(
      id + ": persistent GLB visibility",
      frames.every((f) => f.visibilityChanges === 0),
      { maximum: Math.max(...frames.map((f) => f.visibilityChanges)) },
    );
    check(id + ": arrived", final.phase === "settled", { duration });
    if (
      (from === "layer" && to === "attention") ||
      (from === "attention" && to === "matrix") ||
      (from === "router" && to === "expert")
    ) {
      const startDistance = distance(initial.camera, final.target);
      const maxDistance = Math.max(
        ...frames.map((f) => distance(f.camera, final.target)),
      );
      check(
        id + ": descent does not withdraw first",
        maxDistance <= startDistance * 1.01 + 1e-6,
        { startDistance, maxDistance },
      );
    }
    if (from === "layer" && to === "attention") {
      const q = initial.nodes.q_8;
      check(
        id + ": destination query was already present",
        q.visible &&
          frames.every(
            (f) =>
              f.nodes.q_8?.visible &&
              Math.max(
                ...q.matrix.map((v, i) => Math.abs(v - f.nodes.q_8.matrix[i])),
              ) < 1e-7,
          ),
      );
    }
    const destinationId =
      to === "matrix" ? "score_2" : to === "expert" ? "gate_0" : null;
    if (destinationId) {
      const before = initial.nodes[destinationId];
      check(
        id + ": destination existed at the same position before entry",
        Boolean(before?.visible) &&
          frames.every(
            (f) =>
              f.nodes[destinationId]?.visible &&
              Math.max(
                ...before.matrix.map((v, i) =>
                  Math.abs(v - f.nodes[destinationId].matrix[i]),
                ),
              ) < 1e-7,
          ),
      );
    }
    const steps = frames.slice(1).map((f, i) => ({
      distance: distance(f.camera, frames[i].camera),
      dt: f.elapsed - frames[i].elapsed,
    }));
    const totalDistance = steps.reduce((sum, s) => sum + s.distance, 0);
    const largestStepFraction = Math.max(
      ...steps.map((s) => s.distance / (totalDistance || 1)),
    );
    // A frame may be delayed on software rendering; bound progress by elapsed
    // time rather than assuming a 60 Hz GPU. A single end-of-flight cut fails.
    const cuts = steps.filter(
      (s) => s.distance / (totalDistance || 1) > 0.04 + (8 * s.dt) / duration,
    );
    check(id + ": camera has no instantaneous cut", cuts.length === 0, {
      largestStepFraction,
      maxFrameMs: Math.max(...steps.map((s) => s.dt)),
      totalDistance,
      cuts,
    });
    report.routes.push({
      id,
      frames,
      initial: { camera: initial.camera, target: initial.target },
    });
    await save();
  }
  const intervals = report.routes
    .flatMap((route) =>
      route.frames
        .slice(1)
        .map((frame, i) => frame.elapsed - route.frames[i].elapsed),
    )
    .sort((a, b) => a - b);
  report.frameTiming = {
    samples: intervals.length,
    medianMs: intervals[Math.floor(intervals.length * 0.5)],
    p95Ms: intervals[Math.floor(intervals.length * 0.95)],
    maximumMs: intervals.at(-1),
    environment:
      "Headless Chromium with SwiftShader, renderer inspection and video recording; not a hardware GPU benchmark",
  };
  await page.getByRole("button", { name: names.router, exact: true }).click();
  await page.waitForTimeout(4500);
  const routing = await page.evaluate(() => {
    const root = window.__explorerInspect(),
      nodes = {};
    root.scene.updateMatrixWorld(true);
    root.scene.traverse((o) => {
      if (o.userData?.id) nodes[o.userData.id] = o;
    });
    const face = (id, side) => {
      const object = nodes[id];
      object.geometry.computeBoundingBox();
      const point = root.camera.position
        .clone()
        .set(object.geometry.boundingBox[side].x, 0, 0);
      return nodes.focus.worldToLocal(object.localToWorld(point)).toArray();
    };
    return {
      paths: window.__explorerScene.routerPaths,
      selected: window.__explorerScene.routeExperts,
      faces: Object.fromEntries(
        window.__explorerScene.routeExperts.map((e) => [
          e,
          [
            face("router", "max"),
            face(`expert_${e}`, "min"),
            face(`expert_${e}`, "max"),
            face("merge", "min"),
          ],
        ]),
      ),
    };
  });
  check(
    "exactly two selected router paths",
    routing.paths.length === 2 &&
      routing.paths.every((p) => routing.selected.includes(p.expert)),
  );
  for (const route of routing.paths) {
    const points = [...route.input, ...route.output],
      faces = routing.faces[route.expert];
    check(
      `expert ${route.expert}: routing occupies Y=0 plane`,
      points.every((p) => Math.abs(p[1]) < 1e-8),
      { points },
    );
    check(
      `expert ${route.expert}: routing is orthogonal`,
      [route.input, route.output].every((points) =>
        points
          .slice(1)
          .every(
            (p, i) =>
              p.filter((v, a) => Math.abs(v - points[i][a]) > 1e-8).length ===
              1,
          ),
      ),
    );
    check(
      `expert ${route.expert}: routes meet actual shell faces`,
      distance(route.input[0], faces[0]) < 1e-6 &&
        distance(route.input.at(-1), faces[1]) < 1e-6 &&
        distance(route.output[0], faces[2]) < 1e-6 &&
        distance(route.output.at(-1), faces[3]) < 1e-6,
    );
  }
  await page
    .locator("canvas")
    .screenshot({ path: path.join(output, "router-planar.png") });
} catch (error) {
  report.errors.push(String(error.stack ?? error));
} finally {
  report.video = await page.video()?.path();
  await context.close();
  await browser.close();
  report.passed = !report.errors.length && report.checks.every((c) => c.passed);
  await save();
  console.log(
    JSON.stringify(
      {
        build: report.build,
        passed: report.passed,
        checks: report.checks.map((c) => ({ name: c.name, passed: c.passed })),
        errors: report.errors,
      },
      null,
      2,
    ),
  );
  if (!report.passed) process.exitCode = 1;
}
