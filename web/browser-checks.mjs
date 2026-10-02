import { chromium, expect } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const layout = JSON.parse(
  await readFile(new URL("../shared/layout.json", import.meta.url), "utf8"),
);
const preview = process.env.PREVIEW_URL;
if (!preview)
  throw new Error(
    "Set PREVIEW_URL to the running preview before starting browser acceptance.",
  );
const artifacts = fileURLToPath(
  new URL("../artifacts/browser/", import.meta.url),
);
await mkdir(artifacts, { recursive: true });
const report = {
  started: new Date().toISOString(),
  filter: process.env.BROWSER_CHECK_FILTER ?? null,
  viewport: { width: 1440, height: 1100 },
  checks: [],
  screenshots: [],
  errors: [],
  measurements: {},
};
const browser = await chromium.launch({
  headless: true,
  args: [
    "--no-sandbox",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
const context = await browser.newContext({ viewport: report.viewport });
context.setDefaultTimeout(8000);
context.setDefaultNavigationTimeout(30000);
const page = await context.newPage();
const observeErrors = (target) => {
  target.on("pageerror", (error) =>
    report.errors.push({ kind: "pageerror", message: error.message }),
  );
  target.on("console", (message) => {
    if (message.type() === "error")
      report.errors.push({ kind: "console", message: message.text() });
  });
  target.on("response", (response) => {
    if (response.status() >= 400)
      report.errors.push({
        kind: "http",
        status: response.status(),
        pathname: new URL(response.url()).pathname,
      });
  });
};
observeErrors(page);
const snapshot = (target) =>
  target.evaluate(() => JSON.parse(JSON.stringify(window.__explorer)));
const saveProgress = async () => {
  await writeFile(
    path.join(artifacts, "report.json"),
    JSON.stringify(report, null, 2),
  );
};
const check = async (name, action) => {
  if (
    report.filter &&
    !new RegExp(report.filter).test(name) &&
    !name.startsWith("No browser")
  )
    return;
  const start = Date.now();
  report.activeCheck = name;
  console.log(`START ${name}`);
  await saveProgress();
  try {
    const evidence = await action();
    report.checks.push({
      name,
      passed: true,
      durationMs: Date.now() - start,
      evidence,
    });
    console.log(`PASS ${name} (${Date.now() - start} ms)`);
  } catch (error) {
    report.checks.push({
      name,
      passed: false,
      durationMs: Date.now() - start,
      error: String(error.message),
      context: await snapshot(page).catch(() => null),
    });
    console.log(`FAIL ${name}: ${error.message}`);
    // Close a native select popup or other dismissible UI before later checks.
    await page.keyboard.press("Escape").catch(() => {});
  } finally {
    report.activeCheck = null;
    await saveProgress();
  }
};
const capture = async (name, target = page) => {
  await target.screenshot({
    path: path.join(artifacts, `${name}.png`),
    fullPage: true,
  });
  report.screenshots.push({
    file: `${name}.png`,
    context: await snapshot(target),
  });
  console.log(`CAPTURE ${name}`);
  await saveProgress();
};
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
      // Overview layer frames intentionally pick their enclosing footprint.
      // Sample that actual bounding box; foreground rays still decide the hit.
      if (
        mesh.userData.component === "decoder_layer" &&
        window.__explorer.state.view === "overview"
      ) {
        mesh.geometry.computeBoundingBox();
        const { min, max } = mesh.geometry.boundingBox;
        for (let face = 0; face < 3; face++)
          for (const side of [0, 1]) {
            for (const u of [0.2, 0.5, 0.8])
              for (const v of [0.2, 0.5, 0.8]) {
                const fractions = [u, v];
                let next = 0;
                const point = camera.position.clone();
                for (let axis = 0; axis < 3; axis++) {
                  const ratio = axis === face ? side : fractions[next++];
                  point.setComponent(
                    axis,
                    min.getComponent(axis) +
                      ratio * (max.getComponent(axis) - min.getComponent(axis)),
                  );
                }
                point.applyMatrix4(mesh.matrixWorld).project(camera);
                if (
                  Math.abs(point.x) < 0.98 &&
                  Math.abs(point.y) < 0.98 &&
                  Math.abs(point.z) < 1
                )
                  candidates.push(point);
              }
          }
      }
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
const button = (name) => page.getByRole("button", { name, exact: true });
const view = async (name) => {
  await button(name).click();
  await page.getByLabel("Surroundings", { exact: true }).selectOption("full");
  await settle();
};
const range = async (locator, value) => {
  // Browser input/change events follow the same controlled-input path as dragging a range.
  await locator.evaluate((input, next) => {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    ).set;
    setter.call(input, String(next));
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
};
const seek = async (value) => {
  await range(page.getByRole("slider", { name: "Tour position" }), value);
  await expect.poll(async () => (await snapshot(page)).time).toBe(value);
  await settle();
};
const identity = (state) => ({
  layer: state.layer,
  group: state.group,
  token: state.token,
});
try {
  await page.goto(preview, { waitUntil: "networkidle" });
  await page.waitForFunction(() => window.__explorer?.ready, undefined, {
    timeout: 30000,
  });
  await settle();
  report.build = (await snapshot(page)).build;
  await check(
    "Automatic attention isolation preserves explicit overrides and restored context",
    async () => {
      const control = page.getByLabel("Surroundings", { exact: true });
      await button("Reset").click();
      await expect(control).toHaveValue("muted");
      for (const label of [
        "Attention heads",
        "KV cache",
        "Read attention matrix",
      ]) {
        await button(label).click();
        await expect(control).toHaveValue("isolated");
        await settle();
        expect(
          await page.evaluate(() => window.__explorerScene.contextMode),
        ).toBe("isolated");
        await control.selectOption("full");
        await page.getByLabel("Token", { exact: true }).selectOption("6");
        await page.getByLabel("KV group", { exact: true }).selectOption("3");
        await expect(control).toHaveValue("full");
      }
      await button("Inside a layer").click();
      await expect(control).toHaveValue("muted");
      await button("Attention heads").click();
      await expect(control).toHaveValue("isolated");
      await control.selectOption("muted");
      await seek(32);
      await expect(control).toHaveValue("muted");
      await seek(50);
      await expect(control).toHaveValue("muted");
      await seek(32);
      await expect(control).toHaveValue("isolated");
      await control.selectOption("full");
      const details = page.locator("details.review");
      if ((await details.getAttribute("open")) === null)
        await page
          .getByText("Development view context", { exact: true })
          .click();
      await button("Copy current view").click();
      const field = page.getByRole("textbox", { name: "View context" });
      const saved = await field.inputValue();
      await button("Inside a layer").click();
      await field.fill(saved);
      await button("Restore view").click();
      await expect(control).toHaveValue("full");
      await settle();
      expect((await snapshot(page)).state.view).toBe("attention");
      const canvas = await page.locator("canvas").boundingBox();
      await page.mouse.move(
        canvas.x + canvas.width * 0.5,
        canvas.y + canvas.height * 0.5,
      );
      await page.mouse.down();
      await page.mouse.move(
        canvas.x + canvas.width * 0.6,
        canvas.y + canvas.height * 0.55,
        { steps: 8 },
      );
      await page.mouse.up();
      await expect(control).toHaveValue("full");
      await seek(28.8);
      await expect(control).toHaveValue("muted");
      await button("Play tour").click();
      await expect
        .poll(async () => (await snapshot(page)).state.view, { timeout: 5000 })
        .toBe("attention");
      await button("Pause tour").click();
      await expect(control).toHaveValue("isolated");
      await settle();
      await capture("attention-automatic-isolation");
      await button("Reset").click();
      await expect(control).toHaveValue("muted");
    },
  );
  await check(
    "Attention labels remain mounted at near and far camera distances",
    async () => {
      await button("Reset").click();
      await button("Attention heads").click();
      await settle();
      const details = page.locator("details.review");
      if ((await details.getAttribute("open")) === null)
        await page
          .getByText("Development view context", { exact: true })
          .click();
      await button("Copy current view").click();
      const field = page.getByRole("textbox", { name: "View context" });
      const saved = JSON.parse(await field.inputValue());
      const labels = [
        /^Query projections/,
        /^Key projection/,
        /^Value projection/,
        /^RoPE · Q$/,
        /^RoPE · K$/,
        /^Attention weights · one head$/,
        /^Weighted value sum$/,
        /^K cache$/,
        /^V cache$/,
      ];
      const evidence = [];
      for (const factor of [1, 0.45, 3]) {
        const camera = {
          ...saved.camera,
          position: saved.camera.position.map(
            (value, axis) =>
              saved.camera.target[axis] +
              factor * (value - saved.camera.target[axis]),
          ),
        };
        await field.fill(JSON.stringify({ ...saved, camera }));
        await button("Restore view").click();
        await settle();
        for (const label of labels)
          await expect(
            page.locator(".canvas span").filter({ hasText: label }),
          ).toBeVisible();
        await expect
          .poll(async () => {
            const current = await snapshot(page);
            return Math.max(
              ...["position", "target"].flatMap((field) =>
                current.camera[field].map((value, axis) =>
                  Math.abs(value - camera[field][axis]),
                ),
              ),
            );
          })
          .toBeLessThan(0.00005);
        const actual = await snapshot(page);
        expect(actual.state.view).toBe("attention");
        expect(actual.contextMode).toBe("isolated");
        actual.camera.target.forEach((value, axis) =>
          expect(value).toBeCloseTo(saved.camera.target[axis], 4),
        );
        actual.camera.position.forEach((value, axis) =>
          expect(value).toBeCloseTo(camera.position[axis], 4),
        );
        await capture(`attention-labels-distance-${factor}`);
        evidence.push({ factor, camera: actual.camera });
      }
      await button("Reset").click();
      return evidence;
    },
  );
  await check(
    "Loaded GLB preserves coordinates, dimensions, camera anchor and layer count",
    async () => {
      const ready = (await snapshot(page)).ready;
      expect(ready.assetLoaded).toBe(true);
      expect(ready.checks).toEqual({
        sentinel: true,
        dimensions: true,
        anchor: true,
        layerCount: true,
      });
      return ready.checks;
    },
  );
  await check(
    "Surroundings modes preserve geometry, isolate the focus, and round-trip view context",
    async () => {
      await button("Reset").click();
      const control = page.getByLabel("Surroundings", { exact: true });
      await expect(control).toHaveValue("muted");
      expect((await snapshot(page)).contextMode).toBe("muted");
      const inspect = () =>
        page.evaluate(() => {
          const { scene } = window.__explorerInspect();
          const ids = new Set([
            "norm1",
            "representative_layer",
            "embedding",
            "q_8",
            "score_2",
            "score_3",
          ]);
          const result = {};
          scene.traverse((node) => {
            const id = node.userData.id || node.name;
            if (!ids.has(id)) return;
            let visible = true;
            for (let parent = node; parent; parent = parent.parent)
              visible &&= parent.visible;
            const material = Array.isArray(node.material)
              ? node.material[0]
              : node.material;
            result[id] = {
              visible,
              color: material?.color?.toArray() ?? null,
              opacity: material?.opacity ?? 1,
              world: [...node.matrixWorld.elements],
            };
          });
          return result;
        });
      const mode = async (value) => {
        await control.selectOption(value);
        await expect
          .poll(() => page.evaluate(() => window.__explorerScene.contextMode))
          .toBe(value);
      };
      const brightness = (node) =>
        node.color.reduce((sum, value) => sum + value, 0);
      const evidence = [];
      for (const [name, focused, outside] of [
        [
          "Inside a layer",
          ["norm1", "q_8", "score_2"],
          ["representative_layer", "embedding"],
        ],
        ["Attention heads", ["q_8", "score_2"], ["score_3", "norm1"]],
      ]) {
        await view(name);
        await mode("full");
        const full = await inspect();
        for (const id of [...focused, ...outside]) {
          expect(full[id], `${id} is inspectable`).toBeTruthy();
          expect(full[id].visible).toBe(true);
          expect(full[id].opacity).toBe(1);
        }
        await mode("muted");
        await expect
          .poll(async () => {
            const current = await inspect();
            return outside.every(
              (id) => brightness(current[id]) < brightness(full[id]) * 0.8,
            );
          })
          .toBe(true);
        const muted = await inspect();
        for (const id of [...focused, ...outside]) {
          expect(muted[id].visible).toBe(true);
          expect(muted[id].opacity).toBe(1);
          expect(muted[id].world).toEqual(full[id].world);
        }
        for (const id of focused)
          expect(muted[id].color).toEqual(full[id].color);
        await mode("isolated");
        await expect
          .poll(async () => {
            const current = await inspect();
            return outside.every((id) => !current[id].visible);
          })
          .toBe(true);
        const isolated = await inspect();
        for (const id of focused) expect(isolated[id].visible).toBe(true);
        for (const id of [...focused, ...outside])
          expect(isolated[id].world).toEqual(full[id].world);
        await capture(
          `surroundings-${name === "Inside a layer" ? "layer" : "attention"}-isolated`,
        );
        await mode("full");
        await expect.poll(inspect).toEqual(full);
        evidence.push({ view: name, full, muted, isolated });
      }
      await mode("isolated");
      const details = page.locator("details.review");
      if ((await details.getAttribute("open")) === null)
        await page
          .getByText("Development view context", { exact: true })
          .click();
      await button("Copy current view").click();
      const field = page.getByRole("textbox", { name: "View context" });
      const saved = JSON.parse(await field.inputValue());
      expect(saved.contextMode).toBe("isolated");
      await mode("full");
      await field.fill(JSON.stringify(saved));
      await button("Restore view").click();
      await expect(control).toHaveValue("isolated");
      const legacy = { ...saved };
      delete legacy.contextMode;
      await field.fill(JSON.stringify(legacy));
      await button("Restore view").click();
      await expect(control).toHaveValue("isolated");
      await mode("full");
      await field.fill(JSON.stringify({ ...saved, contextMode: "invalid" }));
      await button("Restore view").click();
      await expect(field).toHaveValue(/Invalid surroundings mode/);
      await expect(control).toHaveValue("full");
      await button("Reset").click();
      await expect(control).toHaveValue("muted");
      await mode("full");
      return evidence;
    },
  );
  await check(
    "First, middle and last select one fixed representative interior",
    async () => {
      await expect(
        page.getByLabel("Layer", { exact: true }).locator("option"),
      ).toHaveText(["First · 1", "Middle · 16", "Last · 32"]);
      for (const layer of [0, 15, 31]) {
        await page
          .getByLabel("Layer", { exact: true })
          .selectOption(String(layer));
        await expect
          .poll(async () => (await snapshot(page)).state.layer)
          .toBe(layer);
        await expect(page.getByLabel("Layer", { exact: true })).toHaveValue(
          String(layer),
        );
        expect((await snapshot(page)).state.view).toBe("layer");
        await expect
          .poll(() =>
            page.evaluate(() => window.__explorerScene?.expandedCount),
          )
          .toBe(1);
        await settle();
        const scene = await page.evaluate(() => window.__explorerScene);
        expect(scene.nodes.representative_layer.world).toEqual([0, 0, 0]);
        expect(scene.nodes.representative_layer.semantic.layer).toBe(layer);
        expect(scene.nodes.focus.world).toEqual([0, 0, 0]);
        expect(scene.nodes.focus.scale).toEqual([
          layout.focus_scale,
          layout.focus_scale,
          layout.focus_scale,
        ]);
      }
      return { selectedLayers: [0, 15, 31] };
    },
  );
  await check(
    "First, middle and last layers preserve group/token on full spatial round trips",
    async () => {
      const tested = [];
      for (const layer of [0, 15, 31]) {
        await page
          .getByLabel("Layer", { exact: true })
          .selectOption(String(layer));
        await page.getByLabel("KV group", { exact: true }).selectOption("5");
        await page.getByLabel("Token", { exact: true }).selectOption("6");
        const wanted = { layer, group: 5, token: 6 };
        for (const [label, expectedView] of [
          ["Overview", "overview"],
          ["Inside a layer", "layer"],
          ["Attention heads", "attention"],
          ["Read attention matrix", "matrix"],
          ["Back to layer", "layer"],
          ["Overview", "overview"],
        ]) {
          await view(label);
          const current = (await snapshot(page)).state;
          expect(identity(current)).toEqual(wanted);
          expect(current.view).toBe(expectedView);
        }
        tested.push(wanted);
      }
      return tested;
    },
  );
  await check(
    "Legacy layer and spacing contexts normalize to the representative choices",
    async () => {
      await expect(
        page.getByRole("slider", { name: "Stack spacing" }),
      ).toHaveCount(0);
      const details = page.locator("details.review");
      if ((await details.getAttribute("open")) === null)
        await page
          .getByText("Development view context", { exact: true })
          .click();
      await button("Copy current view").click();
      const field = page.getByRole("textbox", { name: "View context" });
      const saved = JSON.parse(await field.inputValue());
      expect(saved.layoutVersion).toBe(2);
      delete saved.layoutVersion;
      for (const [legacyLayer, selected] of [
        [2, 0],
        [11, 15],
        [29, 31],
      ]) {
        await field.fill(
          JSON.stringify({
            ...saved,
            state: { ...saved.state, layer: legacyLayer, spacing: 2.6 },
          }),
        );
        await button("Restore view").click();
        await expect
          .poll(async () => (await snapshot(page)).state.layer)
          .toBe(selected);
        expect((await snapshot(page)).state.spacing).toBe(1);
      }
      for (const time of [0, 14, 32, 50, 77]) {
        await seek(time);
        expect([0, 15, 31]).toContain((await snapshot(page)).state.layer);
        expect((await snapshot(page)).state.spacing).toBe(1);
      }
      await button("Reset").click();
      expect((await snapshot(page)).state.layer).toBe(15);
      expect((await snapshot(page)).state.spacing).toBe(1);
      await view("Overview");
      const scene = await page.evaluate(() => window.__explorerScene);
      expect(
        Object.keys(scene.nodes).filter((id) => /^layer_\d+$|^gap_/.test(id)),
      ).toEqual([]);
      expect(scene.nodes.representative_layer.world).toEqual([0, 0, 0]);
      await capture("overview-representative");
    },
  );
  await check(
    "Projected GLB layer mesh is selectable with the mouse",
    async () => {
      await page.getByLabel("Layer", { exact: true }).selectOption("31");
      await view("Overview");
      await settle();
      const node = await page.evaluate(
        () => window.__explorerScene?.nodes?.representative_layer,
      );
      expect(
        node,
        "Projected layer mesh diagnostic must be available",
      ).toBeTruthy();
      expect(node.visible).toBe(true);
      const [x, y] = await surfacePoint("representative_layer");
      const canvas = await page.locator("canvas").boundingBox();
      expect(x).toBeGreaterThan(canvas.x);
      expect(x).toBeLessThan(canvas.x + canvas.width);
      expect(y).toBeGreaterThan(canvas.y);
      expect(y).toBeLessThan(canvas.y + canvas.height);
      await page.mouse.click(x, y);
      await expect
        .poll(async () => (await snapshot(page)).state.view)
        .toBe("layer");
      expect((await snapshot(page)).state.layer).toBe(31);
      await expect
        .poll(() => page.evaluate(() => window.__explorerScene.expandedCount))
        .toBe(1);
      return {
        semanticId: "representative_layer",
        clickedScreen: node.screen,
        world: node.world,
      };
    },
  );
  await check("Orbit drag changes the live camera while paused", async () => {
    await button("Explore").click();
    await view("Overview");
    const before = (await snapshot(page)).camera;
    const canvas = await page.locator("canvas").boundingBox();
    if (!canvas) throw new Error("Canvas has no visible bounds");
    await page.mouse.move(
      canvas.x + canvas.width * 0.48,
      canvas.y + canvas.height * 0.5,
    );
    await page.mouse.down();
    await page.mouse.move(
      canvas.x + canvas.width * 0.7,
      canvas.y + canvas.height * 0.61,
      { steps: 18 },
    );
    await page.mouse.up();
    await settle();
    const after = (await snapshot(page)).camera;
    expect(before).toBeTruthy();
    const radius = Math.hypot(
      ...before.position.map((value, axis) => value - before.target[axis]),
    );
    const movement = Math.hypot(
      ...after.position.map((value, axis) => value - before.position[axis]),
    );
    expect(movement / radius).toBeGreaterThan(0.05);
    expect((await snapshot(page)).playing).toBe(false);
    await capture("overview-second-oblique");
    return { before, after };
  });
  await check("Keyboard controls select layers and retain focus", async () => {
    const control = page.getByLabel("Layer", { exact: true });
    await control.selectOption("0");
    await control.focus();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect(control).toBeFocused();
    expect((await snapshot(page)).state.layer).toBe(15);
    await page.getByLabel("KV group", { exact: true }).selectOption("5");
    await page.getByLabel("KV group", { exact: true }).focus();
    try {
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("Enter");
      await expect.poll(async () => (await snapshot(page)).state.group).toBe(6);
    } finally {
      await page.keyboard.press("Escape");
      await page.keyboard.press("Tab");
    }
  });
  await check(
    "Forward and backward seeking restore deterministic numerical content and state",
    async () => {
      await seek(32);
      const first = await snapshot(page);
      const table = await page.locator("aside table").innerText();
      await seek(60);
      await seek(32);
      const returned = await snapshot(page);
      expect(returned.state).toEqual(first.state);
      expect(returned.time).toBe(first.time);
      expect(await page.locator("aside table").innerText()).toBe(table);
      return { time: returned.time, selection: identity(returned.state) };
    },
  );
  await check(
    "Play, pause, Explore, resume, speed and chapter controls",
    async () => {
      await seek(30);
      await button("Play tour").click();
      await page.waitForTimeout(450);
      expect((await snapshot(page)).playing).toBe(true);
      await button("Pause tour").click();
      const paused = (await snapshot(page)).time;
      await page.waitForTimeout(250);
      expect((await snapshot(page)).time).toBe(paused);
      await button("Play tour").click();
      await page.waitForTimeout(200);
      await button("Explore").click();
      expect((await snapshot(page)).playing).toBe(false);
      await page.getByLabel("Speed", { exact: true }).selectOption("1.5");
      await button("Play tour").click();
      const before = (await snapshot(page)).time;
      await page.waitForTimeout(500);
      const delta = (await snapshot(page)).time - before;
      expect(delta).toBeGreaterThan(0.45);
      await button("Pause tour").click();
      await button("Next").click();
      expect((await snapshot(page)).time).toBe(38);
      await button("Previous").click();
      expect((await snapshot(page)).time).toBe(37);
      await seek(80);
      await button("Play tour").click();
      await page.waitForTimeout(150);
      expect((await snapshot(page)).time).toBeLessThan(2);
      await button("Pause tour").click();
      return { pausedTime: paused, elapsedAtSpeed1_5: delta };
    },
  );
  await check(
    "Context copy and restore return selection, timeline and camera",
    async () => {
      await view("Attention heads");
      if ((await page.locator("details.review").getAttribute("open")) === null)
        await page
          .getByText("Development view context", { exact: true })
          .click();
      await button("Copy current view").click();
      const saved = await page
        .getByRole("textbox", { name: "View context" })
        .inputValue();
      const parsed = JSON.parse(saved);
      expect(parsed.camera).toBeTruthy();
      await page.getByLabel("Layer", { exact: true }).selectOption("0");
      await seek(69);
      await page.getByRole("textbox", { name: "View context" }).fill(saved);
      await button("Restore view").click();
      await settle();
      const actual = await snapshot(page);
      expect(actual.state).toEqual(parsed.state);
      expect(actual.time).toBe(parsed.time);
      expect(actual.camera).toBeTruthy();
      const flatten = (value) =>
        Object.values(value).flatMap((item) =>
          Array.isArray(item)
            ? item
            : typeof item === "object" && item
              ? flatten(item)
              : [],
        );
      const wantedCamera = flatten(parsed.camera),
        restoredCamera = flatten(actual.camera);
      expect(restoredCamera.length).toBe(wantedCamera.length);
      wantedCamera.forEach((value, i) =>
        expect(restoredCamera[i]).toBeCloseTo(value, 2),
      );
      return { selection: identity(actual.state), time: actual.time };
    },
  );
  await check(
    "Tour camera stops and representative transitions captured",
    async () => {
      for (const [time, name] of [
        [2, "overview"],
        [9, "embedding"],
        [16, "layer-extraction"],
        [24, "attention-entry"],
        [33, "attention"],
        [41, "cache"],
        [50, "router"],
        [60, "expert"],
        [70, "output"],
        [77, "decode"],
      ]) {
        await seek(time);
        await capture(`chapter-${String(time).padStart(2, "0")}-${name}`);
      }
      for (const time of [28.9, 29.1, 44.9, 45.1, 65.9, 66.1]) {
        await seek(time);
        await capture(`transition-${time.toFixed(1).replace(".", "-")}`);
      }
      await view("Read attention matrix");
      await capture("matrix-reading");
    },
  );
  await check("Focused expert is one the router selected", async () => {
    const routed = async () => {
      const { state } = await snapshot(page);
      const routes = await page.evaluate(
        () => window.__explorerScene.routeExperts,
      );
      expect(routes).toContain(state.expert);
      return { token: state.token, expert: state.expert, routes };
    };
    const evidence = [];
    await seek(60);
    evidence.push(await routed());
    await button("Reset").click();
    await view("Expert feed-forward network");
    evidence.push(await routed());
    for (const token of ["1", "6"]) {
      await page.getByLabel("Token", { exact: true }).selectOption(token);
      await settle();
      evidence.push(await routed());
    }
    // An explicit pick may open any expert, but must say it was not routed.
    const unrouted = [...Array(8).keys()].find(
      (expert) => !evidence.at(-1).routes.includes(expert),
    );
    await page
      .locator(".router-evidence-table")
      .getByRole("button", { name: String(unrouted + 1), exact: true })
      .click();
    await settle();
    expect((await snapshot(page)).state.expert).toBe(unrouted);
    await expect(
      page.getByText(`The router did not select expert ${unrouted + 1}`),
    ).toBeVisible();
    await capture("expert-unrouted-inspection");
    return evidence;
  });
  await check(
    "Expert mesh picking and actual moving-camera transitions",
    async () => {
      await seek(66.1);
      await view("Expert routing");
      const before = await snapshot(page);
      const point = await surfacePoint(`expert_${before.state.expert}`);
      const hitElement = await page.evaluate(([x, y]) => {
        const element = document.elementFromPoint(x, y);
        return {
          tag: element?.tagName,
          text: element?.textContent?.slice(0, 100),
          rect: document
            .querySelector("canvas")
            .getBoundingClientRect()
            .toJSON(),
        };
      }, point);
      await page.mouse.click(point[0], point[1]);
      await expect
        .poll(async () => (await snapshot(page)).state.view, {
          message: JSON.stringify({
            point,
            hitElement,
            lastPick: await page.evaluate(
              () => window.__explorerScene.lastPick,
            ),
          }),
        })
        .toBe("expert");
      await settle();
      await expect
        .poll(() => page.evaluate(() => window.__explorerScene.lastPick?.id))
        .toBe(`expert_${before.state.expert}`);
      expect((await snapshot(page)).state.view).toBe("expert");
      expect((await snapshot(page)).state.expert).toBe(before.state.expert);
      await page.getByLabel("Speed", { exact: true }).selectOption("1");
      for (const [time, name] of [
        [28.8, "attention"],
        [44.8, "router"],
        [65.8, "output"],
      ]) {
        await seek(time);
        await button("Play tour").click();
        await page.waitForTimeout(350);
        await capture(`moving-transition-${name}`);
        await button("Pause tour").click();
      }
      await page
        .getByLabel("Rendering detail", { exact: true })
        .selectOption("reduced");
      await view("Overview");
      await capture("reduced-rendering");
      await page
        .getByLabel("Rendering detail", { exact: true })
        .selectOption("standard");
    },
  );
  await check(
    "Cache decode appends one row and retains prompt rows",
    async () => {
      await view("KV cache");
      const toggle = page
        .locator("aside button")
        .filter({ hasText: /^(Prefill:|Decode:)/ });
      if ((await toggle.innerText()).startsWith("Decode:"))
        await toggle.click();
      const before = await page.locator("aside tbody tr").allTextContents();
      expect(before.length).toBe(8);
      await toggle.click();
      const after = await page.locator("aside tbody tr").allTextContents();
      expect(after.length).toBe(9);
      expect(after.slice(0, 8)).toEqual(before);
      await capture("cache-decode");
    },
  );
  await check(
    "Overview, layer and attention rendering measurements",
    async () => {
      report.measurements = {
        rendererMode: "Chromium headless ANGLE SwiftShader software renderer",
        note: "Software rendering measurements are diagnostic; representative hardware client performance remains a separate check.",
        views: [],
      };
      for (const [name, control] of [
        ["overview", "Overview"],
        ["layer", "Inside a layer"],
        ["attention", "Attention heads"],
      ]) {
        await view(control);
        await settle();
        const result = await page.evaluate(async () => {
          const frames = [];
          let previous = performance.now();
          await new Promise((resolve) => {
            const tick = (now) => {
              frames.push(now - previous);
              previous = now;
              if (frames.length < 60) requestAnimationFrame(tick);
              else resolve();
            };
            requestAnimationFrame(tick);
          });
          const sorted = frames.slice(1).sort((a, b) => a - b);
          return {
            render: window.__explorerRender ?? null,
            scene: window.__explorerScene ?? null,
            frameCount: sorted.length,
            medianFrameMs: sorted[Math.floor(sorted.length / 2)],
            p95FrameMs: sorted[Math.floor(sorted.length * 0.95)],
            devicePixelRatio,
            userAgent: navigator.userAgent,
            viewport: [innerWidth, innerHeight],
          };
        });
        expect(
          result.render,
          "Renderer diagnostics must be exposed",
        ).toBeTruthy();
        report.measurements.views.push({ name, ...result });
      }
      return report.measurements;
    },
  );
  await check(
    "Narrow reduced-motion layout supports the same selections",
    async () => {
      const narrowContext = await browser.newContext({
        viewport: { width: 390, height: 844 },
        reducedMotion: "reduce",
      });
      narrowContext.setDefaultTimeout(8000);
      narrowContext.setDefaultNavigationTimeout(30000);
      const narrow = await narrowContext.newPage();
      observeErrors(narrow);
      try {
        await narrow.goto(preview, { waitUntil: "networkidle" });
        await narrow.waitForFunction(
          () => window.__explorer?.ready,
          undefined,
          { timeout: 30000 },
        );
        expect(
          await narrow.evaluate(
            () => matchMedia("(prefers-reduced-motion: reduce)").matches,
          ),
        ).toBe(true);
        await narrow.getByLabel("Layer", { exact: true }).selectOption("15");
        await narrow.getByLabel("KV group", { exact: true }).selectOption("7");
        await narrow.getByLabel("Token", { exact: true }).selectOption("7");
        await narrow
          .getByRole("button", { name: "Read attention matrix", exact: true })
          .click();
        await settle(narrow);
        expect(identity((await snapshot(narrow)).state)).toEqual({
          layer: 15,
          group: 7,
          token: 7,
        });
        await capture("narrow-reduced-motion-matrix", narrow);
        expect(
          await narrow.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1,
          ),
        ).toBe(true);
        await narrow
          .getByRole("button", { name: "Back to layer", exact: true })
          .click();
        await narrow
          .getByRole("button", { name: "Overview", exact: true })
          .click();
        await settle(narrow);
        expect(identity((await snapshot(narrow)).state)).toEqual({
          layer: 15,
          group: 7,
          token: 7,
        });
        await capture("narrow-reduced-motion-overview", narrow);
        // Reduced motion shows whole-second tour states instead of gliding.
        await range(
          narrow.getByRole("slider", { name: "Tour position" }),
          28.9,
        );
        await expect
          .poll(() => narrow.evaluate(() => window.__explorerScene.time))
          .toBe(28);
        expect((await snapshot(narrow)).time).toBe(28.9);
        // The selected speed must be shown, including 0.5×.
        await narrow.getByLabel("Speed", { exact: true }).selectOption("0.5");
        expect(
          await narrow.getByLabel("Speed", { exact: true }).inputValue(),
        ).toBe("0.5");
      } finally {
        await narrowContext.close();
      }
    },
  );
  await check("Model and WebGL failures replace only the 3D view", async () => {
    const evidence = {};
    for (const [name, setup, title] of [
      [
        "missing-model",
        (target) =>
          target.route("**/*.glb", (route) => route.fulfill({ status: 404 })),
        "The model could not load",
      ],
      [
        "no-webgl",
        (target) =>
          target.addInitScript(() => {
            const getContext = HTMLCanvasElement.prototype.getContext;
            HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
              return /webgl/.test(type)
                ? null
                : getContext.call(this, type, ...rest);
            };
          }),
        "3D view unavailable",
      ],
    ]) {
      const failing = await browser.newContext({ viewport: report.viewport });
      const target = await failing.newPage();
      await setup(target);
      await target.goto(preview);
      const alert = target.getByRole("alert");
      await expect(alert).toContainText(title);
      // The alert sits inside the canvas area; teaching text and tour stay.
      await expect(target.locator(".canvas [role=alert]")).toBeVisible();
      await expect(
        target.getByRole("heading", { name: "How it works" }),
      ).toBeVisible();
      await expect(
        target.getByRole("button", { name: "Play tour", exact: true }),
      ).toBeVisible();
      await target
        .getByRole("button", { name: "Expert routing", exact: true })
        .click();
      await expect(
        target.getByText("Two selected expert outputs"),
      ).toBeVisible();
      await expect(target.locator(".location")).toContainText("No 3D view");
      await expect(target.getByText("Drag to orbit")).toHaveCount(0);
      await capture(`failure-${name}`, target);
      evidence[name] = await alert.textContent();
      await failing.close();
    }
    return evidence;
  });
  await check("No browser runtime, console or HTTP errors", async () => {
    expect(report.errors).toEqual([]);
  });
} catch (error) {
  report.checks.push({
    name: "Harness startup or completion",
    passed: false,
    error: String(error.stack),
  });
} finally {
  report.finished = new Date().toISOString();
  report.passed = report.checks.every((check) => check.passed);
  // Do not record preview origin, which may contain private network details.
  await writeFile(
    path.join(artifacts, "report.json"),
    JSON.stringify(report, null, 2),
  );
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
        screenshotCount: report.screenshots.length,
      },
      null,
      2,
    ),
  );
  if (!report.passed) process.exitCode = 1;
}
