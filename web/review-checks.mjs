import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

if (!process.env.PREVIEW_URL)
  throw new Error("PREVIEW_URL must identify the running review preview.");
const artifacts = fileURLToPath(
  new URL("../artifacts/review-browser/", import.meta.url),
);
await mkdir(artifacts, { recursive: true });
const report = {
  started: new Date().toISOString(),
  checks: [],
  errors: [],
  screenshots: [],
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
context.setDefaultTimeout(8000);
context.setDefaultNavigationTimeout(30000);
const page = await context.newPage();
page.on("pageerror", (error) =>
  report.errors.push({ kind: "runtime", message: error.message }),
);
page.on("console", (message) => {
  if (message.type() === "error")
    report.errors.push({ kind: "console", message: message.text() });
});
const state = () =>
  page.evaluate(() => JSON.parse(JSON.stringify(window.__explorer)));
const scene = () =>
  page.evaluate(() => JSON.parse(JSON.stringify(window.__explorerScene)));
const save = () =>
  writeFile(
    path.join(artifacts, "report.json"),
    JSON.stringify(report, null, 2),
  );
const button = (name) => page.getByRole("button", { name, exact: true });
// Locate a real foreground surface, then use the browser mouse to pick it.
// Sampling triangles handles frames, bevels, and small nested geometry.
const surfacePoint = async (id) =>
  page.evaluate((id) => {
    const { camera, scene, gl, raycaster } = window.__explorerInspect();
    if (!raycaster)
      throw new Error("Scene inspection must expose its raycaster");
    scene.updateMatrixWorld(true);
    camera.updateMatrixWorld(true);
    const rect = gl.domElement.getBoundingClientRect();
    const visible = (object) => {
      for (let node = object; node; node = node.parent)
        if (!node.visible) return false;
      return true;
    };
    const semantic = (object) => {
      while (object && !object.userData.interactive) object = object.parent;
      return object?.userData.id || object?.name;
    };
    const candidates = [];
    let modelRoot;
    scene.traverse((mesh) => {
      if (!mesh.isMesh || !visible(mesh) || semantic(mesh) !== id) return;
      modelRoot = mesh;
      while (modelRoot.parent && modelRoot.parent !== scene)
        modelRoot = modelRoot.parent;
      const positions = mesh.geometry.attributes.position;
      const indices = mesh.geometry.index;
      const count = indices?.count ?? positions.count;
      for (let i = 0; i + 2 < count; i += 3) {
        const point = camera.position.clone().set(0, 0, 0);
        for (let j = 0; j < 3; j++) {
          const index = indices ? indices.getX(i + j) : i + j;
          point.add(
            camera.position.clone().fromBufferAttribute(positions, index),
          );
        }
        point.divideScalar(3).applyMatrix4(mesh.matrixWorld).project(camera);
        if (
          Math.abs(point.x) >= 0.98 ||
          Math.abs(point.y) >= 0.98 ||
          Math.abs(point.z) >= 1
        )
          continue;
        candidates.push(point);
      }
    });
    candidates.sort((a, b) => a.x * a.x + a.y * a.y - b.x * b.x - b.y * b.y);
    for (const point of candidates) {
      const x = Math.round(rect.x + ((point.x + 1) * rect.width) / 2);
      const y = Math.round(rect.y + ((1 - point.y) * rect.height) / 2);
      // Chromium mouse coordinates land on pixels; require a real pixel interior.
      const hitsTarget = ([dx, dy]) => {
        raycaster.setFromCamera(
          {
            x: ((x + dx - rect.x) / rect.width) * 2 - 1,
            y: 1 - ((y + dy - rect.y) / rect.height) * 2,
          },
          camera,
        );
        const hit = raycaster
          .intersectObject(modelRoot, true)
          .find((hit) => visible(hit.object));
        return hit && semantic(hit.object) === id;
      };
      if (
        [
          [0, 0],
          [0.6, 0],
          [-0.6, 0],
          [0, 0.6],
          [0, -0.6],
        ].every(hitsTarget)
      )
        return [x, y];
    }
    throw new Error(
      `No foreground surface of ${id} is visible in this camera framing`,
    );
  }, id);
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
const view = async (name) => {
  await button(name).click();
  await page.getByLabel("Surroundings", { exact: true }).selectOption("full");
  await settle();
};
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
  await expect.poll(async () => (await state()).time).toBe(time);
  await settle();
};
const capture = async (name) => {
  await page.screenshot({
    path: path.join(artifacts, `${name}.png`),
    fullPage: true,
  });
  report.screenshots.push({ name, state: await state(), scene: await scene() });
};
const check = async (name, action) => {
  const start = Date.now();
  report.activeCheck = name;
  console.log(`START ${name}`);
  await save();
  try {
    report.checks.push({
      name,
      passed: true,
      evidence: await action(),
      durationMs: Date.now() - start,
    });
    console.log(`PASS ${name}`);
  } catch (error) {
    report.checks.push({
      name,
      passed: false,
      error: error.message,
      context: await state().catch(() => null),
      scene: await scene().catch(() => null),
      durationMs: Date.now() - start,
    });
    console.log(`FAIL ${name}: ${error.message}`);
    await page.keyboard.press("Escape").catch(() => {});
    const pause = button("Pause tour");
    if (await pause.count()) await pause.click().catch(() => {});
  } finally {
    report.activeCheck = null;
    await save();
  }
};
const pick = async (id, expectedView) => {
  const before = await scene();
  const node = before.nodes[id];
  expect(node, `Missing projected diagnostic for ${id}`).toBeTruthy();
  expect(node.visible, `${id} must be visible before picking`).toBe(true);
  const canvas = await page.locator("canvas").boundingBox();
  const [x, y] = await surfacePoint(id);
  expect(x).toBeGreaterThan(canvas.x);
  expect(x).toBeLessThan(canvas.x + canvas.width);
  expect(y).toBeGreaterThan(canvas.y);
  expect(y).toBeLessThan(canvas.y + canvas.height);
  await page.mouse.click(x, y);
  await expect.poll(async () => (await state()).state.view).toBe(expectedView);
  await expect.poll(async () => (await scene()).lastPick?.id).toBe(id);
  expect((await scene()).lastPick.count).toBeGreaterThan(
    before.lastPick?.count ?? 0,
  );
  await settle();
  return {
    id,
    clicked: [x, y],
    lastPick: (await scene()).lastPick,
    resultingView: (await state()).state.view,
  };
};
const vectors = async () => {
  const data = await scene();
  expect(data.routerOutputPositions).toHaveLength(2);
  for (const vector of data.routerOutputPositions) {
    expect(vector.position).toHaveLength(3);
    expect(vector.position.every(Number.isFinite)).toBe(true);
  }
  return data.routerOutputPositions;
};
// Measure a rendered vector's position along its connector without assuming a
// straight line. Every connector turn must change one world-space axis at a time.
const inspectPath = (points, position) => {
  expect(points.length).toBeGreaterThan(1);
  let length = 0,
    closest = { distance: Infinity, along: 0 };
  points.slice(1).forEach((end, index) => {
    const start = points[index];
    const difference = end.map((coordinate, axis) => coordinate - start[axis]);
    const axes = difference.filter((coordinate) => Math.abs(coordinate) > 1e-7);
    expect(
      axes.length,
      `Connector segment ${index} must follow exactly one axis`,
    ).toBe(1);
    const segmentLength = Math.hypot(...difference);
    if (position) {
      const ratio = Math.max(
        0,
        Math.min(
          1,
          difference.reduce(
            (sum, coordinate, axis) =>
              sum + coordinate * (position[axis] - start[axis]),
            0,
          ) /
            segmentLength ** 2,
        ),
      );
      const projected = start.map(
        (coordinate, axis) => coordinate + difference[axis] * ratio,
      );
      const distance = Math.hypot(
        ...projected.map((coordinate, axis) => coordinate - position[axis]),
      );
      if (distance < closest.distance)
        closest = { distance, along: length + ratio * segmentLength };
    }
    length += segmentLength;
  });
  return { length, ...closest };
};
const expectPositions = (actual, expected, precision = 6) => {
  expect(actual.map((item) => item.expert)).toEqual(
    expected.map((item) => item.expert),
  );
  actual.forEach((item, index) =>
    item.position.forEach((coordinate, axis) =>
      expect(coordinate).toBeCloseTo(expected[index].position[axis], precision),
    ),
  );
};
try {
  await page.goto(process.env.PREVIEW_URL, { waitUntil: "networkidle" });
  await page.waitForFunction(() => window.__explorer?.ready, undefined, {
    timeout: 30000,
  });
  await settle();
  report.build = (await state()).build;
  await check(
    "Persistent attention sheets preserve Group 3 foreground picking",
    async () => {
      await button("Reset").click();
      await page.getByLabel("KV group", { exact: true }).selectOption("2");
      await view("Read attention matrix");
      const before = await scene();
      expect(before.nodes.score_2.visible).toBe(true);
      for (let group = 0; group < 8; group++) {
        expect(before.nodes[`score_${group}`].visible).toBe(true);
        expect(before.nodes[`score_${group}`].opacity).toBe(1);
      }
      const evidence = await pick("score_2", "attention");
      expect((await state()).state.group).toBe(2);
      await capture("matrix-visible-pick");
      return evidence;
    },
  );
  for (const [id, framing, expectedView] of [
    ["input", "Tokens & embeddings", "input"],
    ["embedding", "Tokens & embeddings", "input"],
    ["final_norm", "Output & generation", "output"],
    ["lm_head", "Output & generation", "output"],
    ["output", "Output & generation", "output"],
    ["cache_k_2", "KV cache", "cache"],
    ["cache_v_2", "KV cache", "cache"],
  ]) {
    await check(`Clicking ${id} opens its semantic explanation`, async () => {
      await button("Reset").click();
      await view(framing);
      const evidence = await pick(id, expectedView);
      if (id.startsWith("cache_")) expect((await state()).state.group).toBe(2);
      await capture(`pick-${id}`);
      return evidence;
    });
  }
  await check(
    "Pausing the cache chapter retains nine rows and prior K/V entries",
    async () => {
      await button("Reset").click();
      await seek(42);
      await button("Play tour").click();
      await page.waitForTimeout(180);
      const before = await scene();
      expect(before.cacheRows).toBe(9);
      await button("Pause tour").click();
      await settle();
      const paused = await scene();
      expect(paused.time).toBeLessThan(45);
      expect(paused.cacheRows).toBe(9);
      expect(paused.cache).toEqual(before.cache);
      const pausedTime = (await state()).time;
      await page.waitForTimeout(180);
      expect((await state()).time).toBe(pausedTime);
      expect((await scene()).cacheRows).toBe(9);
      await seek(39);
      expect((await scene()).cacheRows).toBe(8);
      await seek(42);
      expect((await scene()).cache).toEqual(before.cache);
      await capture("cache-paused-nine-rows");
      return { before, paused };
    },
  );
  await check(
    "Layer and router connectors have only orthogonal segments",
    async () => {
      const evidence = [];
      for (const [control, filename] of [
        ["Inside a layer", "orthogonal-layer"],
        ["Expert routing", "orthogonal-router"],
      ]) {
        await view(control);
        const current = await scene();
        expect(current.routerPaths).toHaveLength(2);
        for (const route of current.routerPaths) inspectPath(route.points);
        evidence.push({
          view: current.selected.view,
          paths: current.routerPaths,
        });
        await capture(filename);
      }
      return evidence;
    },
  );
  await check(
    "Persistent cache connectors retain both visible endpoints across camera views",
    async () => {
      const evidence = [];
      for (const control of ["Inside a layer", "Attention group", "KV cache"]) {
        await view(control);
        const current = await scene();
        // Inspect the actual post-RoPE/write/read graph, including nodes outside
        // the compact public diagnostic list.
        const graph = await page.evaluate(() => {
          const { scene, camera } = window.__explorerInspect();
          const nodes = {};
          scene.traverse((node) => {
            const id = node.userData.id || node.name;
            if (
              !/^(rope_k|v|cache_v_write|cache_k_read|cache_v_read|weighted_sum)_\d+$/.test(
                id,
              )
            )
              return;
            let visible = true;
            for (let parent = node; parent; parent = parent.parent)
              visible &&= parent.visible;
            nodes[id] = {
              semantic: node.userData,
              visible,
              world: node.getWorldPosition(camera.position.clone()).toArray(),
              scale: node.getWorldScale(camera.position.clone()).toArray(),
            };
          });
          return nodes;
        });
        Object.assign(current.nodes, graph);
        for (let group = 0; group < 8; group++) {
          const cache = current.nodes[`cache_${group}`],
            link = current.nodes[`cache_link_${group}`];
          expect(cache, `Cache ${group} inspection is available`).toBeTruthy();
          expect(
            link,
            `Cache link ${group} inspection is available`,
          ).toBeTruthy();
          const source = current.nodes[`rope_k_${group}`],
            destination = current.nodes[`cache_k_${group}`];
          expect(source).toBeTruthy();
          expect(destination).toBeTruthy();
          expect(cache.visible).toBe(true);
          expect(source.visible).toBe(true);
          expect(destination.visible).toBe(true);
          expect(link.visible).toBe(true);
          expect(link.semantic.post_rope).toBe(true);
          for (const [id, sourceId, targetId, operation] of [
            [
              `cache_link_${group}`,
              `rope_k_${group}`,
              `cache_k_${group}`,
              "write",
            ],
            [
              `cache_v_write_${group}`,
              `v_${group}`,
              `cache_v_${group}`,
              "write",
            ],
            [
              `cache_k_read_${group}`,
              `cache_k_${group}`,
              `score_${group}`,
              "read",
            ],
            [
              `cache_v_read_${group}`,
              `cache_v_${group}`,
              `weighted_sum_${group}`,
              "read",
            ],
          ]) {
            const connection = current.nodes[id];
            expect(connection.visible).toBe(true);
            expect(connection.semantic.source_id).toBe(sourceId);
            expect(connection.semantic.target_id).toBe(targetId);
            expect(connection.semantic.cache_operation).toBe(operation);
            expect(current.nodes[sourceId].visible).toBe(true);
            expect(current.nodes[targetId].visible).toBe(true);
          }
          if (evidence.length) {
            for (const id of [
              `rope_k_${group}`,
              `cache_k_${group}`,
              `cache_link_${group}`,
            ]) {
              expect(current.nodes[id].world).toEqual(
                evidence[0].nodes[id].world,
              );
              expect(current.nodes[id].scale).toEqual(
                evidence[0].nodes[id].scale,
              );
            }
          }
        }
        evidence.push({ view: current.selected.view, nodes: current.nodes });
      }
      return evidence;
    },
  );
  await check(
    "Causal attention data identifies allowed keys and masks future positions",
    async () => {
      const evidence = [];
      await view("Attention group");
      for (const token of [0, 3, 7]) {
        await page
          .getByLabel("Token", { exact: true })
          .selectOption(String(token));
        await settle();
        const current = await scene();
        const rows = await page
          .locator(".evidence-strip .evidence-number")
          .evaluateAll((nodes) =>
            nodes.map((node) => ({
              value: Number(node.dataset.value),
              masked: node.dataset.masked === "true",
              text: node.textContent,
              width: node.querySelector("rect")?.getAttribute("width") ?? null,
            })),
          );
        expect(rows).toHaveLength(8);
        let total = 0;
        for (const [key, row] of rows.entries()) {
          expect(row.masked).toBe(key > token);
          expect(row.value).toBeCloseTo(current.attentionRow[key], 10);
          expect(row.text).toContain(row.value.toFixed(3));
          total += row.value;
          if (key <= token)
            expect(Number(row.width)).toBeCloseTo(row.value * 100, 10);
          else {
            expect(row.width).toBeNull();
            expect(row.value).toBe(0);
            expect(row.text).toContain("×");
          }
        }
        expect(total).toBeCloseTo(1, 10);
        expect(current.nodes[`score_${current.selected.group}`].visible).toBe(
          true,
        );
        expect(current.nodes[`score_${current.selected.group}`].opacity).toBe(
          1,
        );
        evidence.push({
          token,
          rows,
          score: current.nodes[`score_${current.selected.group}`],
        });
        await capture(`attention-token-${token + 1}`);
      }
      return evidence;
    },
  );
  await check(
    "Router vectors preserve pause and return to the same scrubbed timestamp",
    async () => {
      await button("Reset").click();
      await seek(51.2);
      const reference = await vectors();
      await button("Play tour").click();
      await page.waitForTimeout(220);
      const before = await scene();
      await button("Pause tour").click();
      await settle();
      const paused = await scene();
      const delta = paused.time - before.time;
      expect(delta).toBeGreaterThanOrEqual(0);
      before.routerOutputPositions.forEach((entry, index) => {
        const path = paused.routerPaths
          .find((route) => route.expert === entry.expert)
          .output.map((point) =>
            point.map(
              (value, axis) =>
                paused.nodes.focus.world[axis] +
                value * paused.nodes.focus.scale[axis],
            ),
          );
        const first = inspectPath(path, entry.position);
        const last = inspectPath(
          path,
          paused.routerOutputPositions[index].position,
        );
        expect(first.distance).toBeLessThan(1e-5);
        expect(last.distance).toBeLessThan(1e-5);
        expect(last.along - first.along).toBeCloseTo(
          (last.length * delta) / 7,
          3,
        );
        expect(last.along / last.length).toBeCloseTo((paused.time - 49) / 7, 5);
      });
      // Compare the same timestamp through the review UI so a change in playback
      // ownership cannot replace the vectors with a fixed paused pose.
      const review = page.locator("details.review");
      if ((await review.getAttribute("open")) === null)
        await page
          .getByText("Development view context", { exact: true })
          .click();
      await button("Copy current view").click();
      const pausedContext = await page
        .getByRole("textbox", { name: "View context" })
        .inputValue();
      expect(JSON.parse(pausedContext).time).toBe(paused.time);
      await seek(54.2);
      await page
        .getByRole("textbox", { name: "View context" })
        .fill(pausedContext);
      await button("Restore view").click();
      await settle();
      expect((await state()).time).toBe(paused.time);
      expectPositions(await vectors(), paused.routerOutputPositions);
      const still = await vectors();
      await page.waitForTimeout(250);
      expectPositions(await vectors(), still);
      await seek(54.2);
      expect(await vectors()).not.toEqual(reference);
      await seek(51.2);
      expectPositions(await vectors(), reference);
      await capture("router-paused-deterministic");
      return { reference, before, paused };
    },
  );
  await check(
    "Context restore retains manual decode; Reset returns to prefill",
    async () => {
      await button("Reset").click();
      await view("KV cache");
      const toggle = page
        .locator("aside button")
        .filter({ hasText: /^(Prefill:|Decode:)/ });
      expect((await scene()).cacheRows).toBe(8);
      await toggle.click();
      await expect.poll(async () => (await scene()).cacheRows).toBe(9);
      const review = page.locator("details.review");
      if ((await review.getAttribute("open")) === null)
        await page
          .getByText("Development view context", { exact: true })
          .click();
      await button("Copy current view").click();
      const text = await page
        .getByRole("textbox", { name: "View context" })
        .inputValue();
      expect(JSON.parse(text).decode).toBe(true);
      await toggle.click();
      await expect.poll(async () => (await scene()).cacheRows).toBe(8);
      await page.getByRole("textbox", { name: "View context" }).fill(text);
      await button("Restore view").click();
      await settle();
      expect((await scene()).cacheRows).toBe(9);
      await capture("context-restored-decode");
      await button("Reset").click();
      await view("KV cache");
      expect((await scene()).cacheRows).toBe(8);
      expect((await state()).time).toBe(0);
      await capture("reset-prefill");
      return { restoredRows: 9, resetRows: 8 };
    },
  );
  await check(
    "Probability bars retain exact values and readable common scales at desktop and narrow widths",
    async () => {
      const evidence = [];
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: 1000 });
        for (const [control, selector, name] of [
          ["Attention group", ".evidence-strip", "attention"],
          ["Expert routing", ".router-evidence-table", "router"],
        ]) {
          await view(control);
          const panel = page.locator(selector);
          await panel.scrollIntoViewIfNeeded();
          await expect(panel.locator(".evidence-number")).toHaveCount(8);
          const rows = await panel
            .locator(".evidence-number")
            .evaluateAll((nodes) =>
              nodes.map((node) => {
                const value = Number(node.dataset.value);
                const masked = node.dataset.masked === "true";
                const bar = node.querySelector("rect");
                return {
                  value,
                  masked,
                  text: node.textContent,
                  width: bar ? Number(bar.getAttribute("width")) : null,
                  barPixels: node.querySelector("svg").getBoundingClientRect()
                    .width,
                };
              }),
            );
          for (const row of rows) {
            expect(row.text).toContain(row.value.toFixed(3));
            if (row.masked) {
              expect(row.value).toBe(0);
              expect(row.width).toBeNull();
              expect(row.text).toContain("×");
            } else expect(row.width).toBeCloseTo(row.value * 100, 8);
            expect(row.barPixels).toBe(rows[0].barPixels);
            expect(row.barPixels).toBeGreaterThanOrEqual(60);
          }
          expect(rows.reduce((sum, row) => sum + row.value, 0)).toBeCloseTo(
            1,
            8,
          );
          expect(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= window.innerWidth,
            ),
          ).toBe(true);
          await capture(`evidence-${name}-${width}`);
          evidence.push({ width, name, rows });
        }
      }
      await page.setViewportSize({ width: 1440, height: 1000 });
      return evidence;
    },
  );
  await check("No runtime or console errors", async () => {
    expect(report.errors).toEqual([]);
  });
} catch (error) {
  report.checks.push({
    name: "Harness startup",
    passed: false,
    error: error.message,
  });
} finally {
  report.finished = new Date().toISOString();
  report.passed = report.checks.every((item) => item.passed);
  await save();
  await browser.close();
  console.log(
    JSON.stringify(
      {
        passed: report.passed,
        checks: report.checks.map(({ name, passed }) => ({ name, passed })),
      },
      null,
      2,
    ),
  );
  if (!report.passed) process.exitCode = 1;
}
