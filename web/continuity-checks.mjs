import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import * as THREE from "three";
if (!process.env.PREVIEW_URL) throw Error("PREVIEW_URL required.");
const artifacts = fileURLToPath(
  new URL("../artifacts/continuity-browser/", import.meta.url),
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
page.setDefaultTimeout(15000);
const report = {
  started: new Date().toISOString(),
  transitions: [],
  errors: [],
  screenshots: [],
  checks: [],
};
page.on("pageerror", (e) => report.errors.push(e.message));
const save = () =>
  writeFile(
    path.join(artifacts, "report.json"),
    JSON.stringify(report, null, 2),
  );
const shot = async (name) => {
  await page
    .locator("canvas")
    .screenshot({ path: path.join(artifacts, name + ".png") });
  report.screenshots.push(name);
};
const labels = {
  overview: "Model overview",
  layer: "Inside a layer",
  attention: "Attention group",
  matrix: "Read attention matrix",
  router: "Expert routing",
  expert: "Inside an expert",
  cache: "KV cache",
};
const norm = (a, b) => Math.hypot(...a.map((x, i) => x - b[i]));
try {
  await page.goto(process.env.PREVIEW_URL, { waitUntil: "networkidle" });
  await page.waitForFunction(() => window.__explorer?.ready);
  await page.waitForTimeout(1800);
  report.build = await page.evaluate(() => window.__explorer.build);
  report.canvas = await page.locator("canvas").boundingBox();
  report.renderStore = await page.evaluate(() => {
    const canvas = document.querySelector("canvas");
    const root = window.__explorerInspect?.();
    if (
      !root?.camera?.isPerspectiveCamera ||
      !root.scene ||
      root.gl?.domElement !== canvas
    )
      throw new Error(
        "Renderer inspection must reference the displayed canvas and perspective camera.",
      );
    return {
      found: true,
      method: "read-only renderer inspection hook",
      cameraType: root.camera.type,
      canvasMatches: true,
    };
  });
  console.log("RENDER STORE " + JSON.stringify(report.renderStore));
  const journey = ["overview", "layer", "attention", "layer"];
  for (let step = 1; step < journey.length; step++) {
    const from = journey[step - 1],
      to = journey[step],
      id = from + "-" + to;
    console.log("START " + id);
    await page.evaluate(() => {
      window.__continuityFrames = [];
      window.__continuityDone = false;
      const start = performance.now();
      let active = false,
        finished = null;
      const snapshot = (now) => {
        const d = window.__explorerScene;
        if (!d) return requestAnimationFrame(snapshot);
        if (d.navigationPhase !== "settled") active = true;
        if (active && d.navigationPhase === "settled" && !finished)
          finished = now;
        const root = window.__explorerInspect();
        const nodes = {};
        let renderedCamera = null;
        const effects = [];
        if (root) {
          const tracked = new Set([
            "stack",
            "focus",
            "layer_0",
            "layer_11",
            "layer_31",
            "attention",
            "norm1",
            "norm2",
            "q_8",
            "k_2",
            "v_2",
            "router",
            "merge",
            "score_2",
            "expert_0",
            "expert_detail",
            "cache_k_2",
            "cache_v_2",
          ]);
          root.scene.updateMatrixWorld(true);
          root.scene.traverse((o) => {
            if (["layer-origin", "computation-flow"].includes(o.name)) {
              let visible = true;
              for (let parent = o; parent; parent = parent.parent)
                visible = visible && parent.visible;
              effects.push({ name: o.name, visible });
            }
            if (!tracked.has(o.userData?.id)) return;
            let visible = true;
            for (let a = o; a; a = a.parent) visible = visible && a.visible;
            const matrix = o.matrixWorld.elements;
            nodes[o.userData.id] = {
              visible,
              opacity: o.material?.opacity ?? 1,
              position: o.position.toArray(),
              world: [matrix[12], matrix[13], matrix[14]],
              scale: o.scale.toArray(),
              worldScale: [
                Math.hypot(matrix[0], matrix[1], matrix[2]),
                Math.hypot(matrix[4], matrix[5], matrix[6]),
                Math.hypot(matrix[8], matrix[9], matrix[10]),
              ],
              component: o.userData.component,
            };
          });
          renderedCamera = {
            position: root.camera.position.toArray(),
            quaternion: root.camera.quaternion.toArray(),
            fov: root.camera.fov,
          };
        }
        const canvas = document.querySelector("canvas").getBoundingClientRect();
        const html = [...document.querySelectorAll(".canvas div")]
          .filter((e) => {
            const s = getComputedStyle(e);
            const r = e.getBoundingClientRect();
            return (
              s.pointerEvents === "none" &&
              s.position !== "static" &&
              r.top < canvas.bottom &&
              r.bottom > canvas.top &&
              r.left < canvas.right &&
              r.right > canvas.left
            );
          })
          .map((e) => e.textContent.trim())
          .filter(Boolean);
        window.__continuityFrames.push({
          elapsedMs: now - start,
          phase: d.navigationPhase,
          presentedView: d.presentedView,
          selected: d.selected,
          camera: d.camera,
          renderedCamera,
          nodes: root ? nodes : d.nodes,
          labels: [...new Set(html)],
          effects,
        });
        if (now - start > 8500 || (finished && now - finished > 350)) {
          window.__continuityDone = true;
          return;
        }
        requestAnimationFrame(snapshot);
      };
      requestAnimationFrame(snapshot);
    });
    await page.getByRole("button", { name: labels[to], exact: true }).click();
    await page.waitForFunction(
      () => window.__explorerScene.navigationPhase === "context",
    );
    await shot(id + "-context");
    await page.waitForFunction(
      () => window.__explorerScene.navigationPhase === "aim",
    );
    await page.waitForTimeout(200);
    await shot(id + "-aim-expanded");
    await page.waitForFunction(
      () => window.__explorerScene.navigationPhase === "zoom-in",
    );
    await page.waitForTimeout(650);
    await shot(id + "-late-zoom");
    await page.waitForFunction(() => window.__continuityDone);
    await shot(id + "-arrival");
    const frames = await page.evaluate(() => window.__continuityFrames);
    const destination = new THREE.Vector3(...frames.at(-1).camera.target);
    const projectionCamera = new THREE.PerspectiveCamera(
      45,
      report.canvas.width / report.canvas.height,
      0.05,
      200,
    );
    for (const frame of frames) {
      projectionCamera.position.set(...frame.renderedCamera.position);
      projectionCamera.quaternion.set(...frame.renderedCamera.quaternion);
      projectionCamera.fov = frame.renderedCamera.fov;
      projectionCamera.updateProjectionMatrix();
      projectionCamera.updateMatrixWorld(true);
      const projected = destination.clone().project(projectionCamera);
      frame.destinationScreen = [
        ((projected.x + 1) * report.canvas.width) / 2,
        ((1 - projected.y) * report.canvas.height) / 2,
      ];
      frame.destinationOffsetPx = Math.hypot(
        (projected.x * report.canvas.width) / 2,
        (projected.y * report.canvas.height) / 2,
      );
    }
    const steps = [];
    for (let i = 1; i < frames.length; i++) {
      const a = frames[i - 1],
        b = frames[i];
      const changes = [];
      for (const [node, current] of Object.entries(b.nodes)) {
        const old = a.nodes[node];
        if (!old) continue;
        const move = norm(old.world, current.world),
          scale =
            old.scale && current.scale ? norm(old.scale, current.scale) : 0,
          alpha = Math.abs(old.opacity - current.opacity);
        if (
          move > 0.001 ||
          scale > 0.001 ||
          alpha > 0.05 ||
          old.visible !== current.visible
        )
          changes.push({
            id: node,
            move,
            scale,
            alpha,
            wasVisible: old.visible,
            visible: current.visible,
          });
      }
      steps.push({
        elapsedMs: b.elapsedMs,
        dt: b.elapsedMs - a.elapsedMs,
        phase: b.phase,
        presentedView: b.presentedView,
        cameraStep: norm(a.camera.position, b.camera.position),
        cameraDiagnosticError: b.renderedCamera
          ? norm(b.renderedCamera.position, b.camera.position)
          : null,
        changed: changes,
        labelsAdded: b.labels.filter((l) => !a.labels.includes(l)),
        labelsRemoved: a.labels.filter((l) => !b.labels.includes(l)),
      });
    }
    const arrival = steps.findIndex(
      (s, i) =>
        s.phase === "settled" && i > 0 && steps[i - 1].phase !== "settled",
    );
    const arrivalChanges = steps.slice(Math.max(0, arrival - 2), arrival + 4);
    const summary = {
      from,
      to,
      frames: frames.length,
      maxCameraStep: Math.max(...steps.map((s) => s.cameraStep)),
      maxDiagnosticCameraError: Math.max(
        ...steps.map((s) => s.cameraDiagnosticError ?? 0),
      ),
      arrivalChanges,
      start: frames[0],
      end: frames.at(-1),
      approach: {
        destination: destination.toArray(),
        firstScreen: frames.find((frame) => frame.phase === "zoom-in")
          ?.destinationScreen,
        maxOffsetPx: Math.max(
          ...frames
            .filter((frame) => frame.phase === "zoom-in")
            .map((frame) => frame.destinationOffsetPx),
        ),
        finalScreen: frames.at(-1).destinationScreen,
        centeredBeforeDolly: frames
          .filter((frame) => frame.phase === "zoom-in")
          .every((frame) => frame.destinationOffsetPx < 5),
      },
    };
    report.checks.push({
      name: id + ": diagnostics match the rendered camera",
      passed: summary.maxDiagnosticCameraError < 1e-6,
      evidence: { maxError: summary.maxDiagnosticCameraError },
    });
    if (to === "layer") {
      const inward = frames.filter((frame) => frame.phase === "zoom-in");
      const first = inward[0];
      const transformDeltas = inward.map((frame) =>
        Object.fromEntries(
          ["stack", "focus", "layer_11"].map((id) => {
            const a = first.nodes[id],
              b = frame.nodes[id];
            return [
              id,
              {
                world: norm(a.world, b.world),
                scale:
                  a.worldScale && b.worldScale
                    ? norm(a.worldScale, b.worldScale)
                    : null,
              },
            ];
          }),
        ),
      );
      report.checks.push({
        name: id + ": destination centered before and throughout dolly",
        passed: summary.approach.centeredBeforeDolly,
        evidence: summary.approach,
      });
      report.checks.push({
        name: id + ": stack and focus stay physically fixed throughout dolly",
        passed: transformDeltas.every((frame) =>
          Object.values(frame).every(
            (delta) =>
              delta.world < 0.001 &&
              (delta.scale === null || delta.scale < 0.001),
          ),
        ),
        evidence: {
          maxima: Object.fromEntries(
            ["stack", "focus", "layer_11"].map((id) => [
              id,
              {
                world: Math.max(
                  ...transformDeltas.map((frame) => frame[id].world),
                ),
                scale: Math.max(
                  ...transformDeltas.map((frame) => frame[id].scale ?? 0),
                ),
              },
            ]),
          ),
        },
      });
      report.checks.push({
        name: id + ": layer geometry is fully present before dolly",
        passed: inward.every((frame) =>
          ["q_8", "router"].every(
            (id) =>
              frame.nodes[id]?.visible &&
              (frame.nodes[id]?.opacity ?? 1) > 0.99,
          ),
        ),
      });
      const throughArrival = frames.filter(
        (frame) => frame.elapsedMs >= first.elapsedMs,
      );
      const firstLabels = [...first.labels].sort();
      report.checks.push({
        name:
          id +
          ": layer annotations and effects remain consistent through arrival",
        passed: throughArrival.every(
          (frame) =>
            JSON.stringify([...frame.labels].sort()) ===
              JSON.stringify(firstLabels) &&
            JSON.stringify(frame.effects) === JSON.stringify(first.effects),
        ),
        evidence: {
          firstLabels,
          finalLabels: frames.at(-1).labels,
          firstEffects: first.effects,
          finalEffects: frames.at(-1).effects,
        },
      });
      report.checks.push({
        name: id + ": visible lineage connector identifies the expanded layer",
        passed: throughArrival.every(
          (frame) =>
            frame.effects.some(
              (effect) => effect.name === "layer-origin" && effect.visible,
            ) &&
            frame.labels.includes(
              `Layer ${frame.selected.layer + 1} in the stack`,
            ),
        ),
      });
    }
    report.transitions.push({ id, summary, frames, steps });
    await save();
    console.log(
      "DONE " +
        id +
        " arrival changed " +
        arrivalChanges.reduce((n, s) => n + s.changed.length, 0) +
        " label events " +
        arrivalChanges.reduce(
          (n, s) => n + s.labelsAdded.length + s.labelsRemoved.length,
          0,
        ),
    );
  }
} catch (e) {
  report.errors.push(e.stack ?? e.message);
  console.log("FAIL " + e.message);
} finally {
  report.finished = new Date().toISOString();
  report.video = await page.video()?.path();
  await context.close();
  await browser.close();
  await save();
  console.log(
    JSON.stringify(
      {
        build: report.build,
        renderStore: report.renderStore,
        transitions: report.transitions.length,
        errors: report.errors,
      },
      null,
      2,
    ),
  );
  report.passed =
    !report.errors.length && report.checks.every((check) => check.passed);
  await save();
  if (!report.passed) process.exitCode = 1;
}
