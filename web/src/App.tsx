import { useEffect, useMemo, useRef, useState } from "react";
import Scene, { type CameraPose, type Selection } from "./Scene";
import { sample, tokens, chapters, chapterAt, type View } from "./data";
const initial: Selection = {
  layer: 11,
  group: 2,
  token: 4,
  expert: 0,
  view: "overview",
  spacing: 1,
};
const views: View[] = [
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
const labels: Record<View, string> = {
  overview: "Model overview",
  input: "Tokens & embeddings",
  layer: "Inside a layer",
  attention: "Attention group",
  cache: "KV cache",
  router: "Expert routing",
  expert: "Inside an expert",
  matrix: "Read attention matrix",
  output: "Output & generation",
};
const explanations: Record<View, string> = {
  overview:
    "Trace a token through 32 decoder layers. Each layer has distinct learned weights. Depth separates sequential layers; it does not show physical memory or an embedding space.",
  input:
    "A token ID selects a learned embedding row: 4,096 numbers form its initial representation. The words below are illustrative chunks, not verified tokenizer boundaries.",
  layer:
    "The residual stream carries the current representation around each sublayer. RMSNorm rescales the representation before attention and before the expert network. Each sublayer output is added to its bypass.",
  attention:
    "Queries ask which earlier positions are useful. Keys determine the match; values supply the information to combine. Four query heads share one key/value head pair. Each query head has its own learned projection.",
  cache:
    "Prefill stores keys and values for the prompt in each layer. Decode appends the new token’s keys and values and reads the retained entries. These are runtime activations; model weights remain separate.",
  router:
    "The router scores eight experts for this token in this layer. The two highest scores select two parallel transformations. Their normalized weights combine the output vectors before the residual addition.",
  expert:
    "Each selected expert applies gate and up projections to the same activation. SiLU transforms the gate; elementwise multiplication combines it with the up branch. A down projection returns to width 4,096.",
  matrix:
    "Rows are query token positions; columns are key token positions. A causal mask prevents a query from reading future positions. Each allowed row sums to one and weights the value vectors.",
  output:
    "After all layers, final RMSNorm and the language-model head produce 32,000 vocabulary scores, called logits. A selection rule chooses the next token. The next decode step reuses each layer’s cached keys and values.",
};
const build = (import.meta as any).env.VITE_BUILD_ID || "development";
const reviewEnabled =
  (import.meta as any).env.VITE_REVIEW === "1" || (import.meta as any).env.DEV;
export default function App() {
  const [state, setState] = useState<Selection>(initial);
  const [cameraRevision, setCameraRevision] = useState(0);
  const [lowQuality, setLowQuality] = useState(false);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [ready, setReady] = useState<any>(null);
  const [context, setContext] = useState("");
  const [restorePose, setRestorePose] = useState<CameraPose | null>(null);
  const [decode, setDecode] = useState(false);
  const [matrixOrigin, setMatrixOrigin] = useState<View>("attention");
  const cameraRef = useRef<CameraPose | null>(null);
  const reduced = useMemo(
    () => matchMedia("(prefers-reduced-motion: reduce)").matches,
    [],
  );
  const data = useMemo(
    () => sample(state.layer, state.group, state.token),
    [state.layer, state.group, state.token],
  );
  const chosen = data.candidates.reduce((best, c) =>
    c.logit > best.logit ? c : best,
  );
  const chapter = chapterAt(time);
  const showingDecode =
    decode || (playing && ((time >= 41.5 && time < 45) || time >= 74));
  const change = (patch: Partial<Selection>) => {
    setPlaying(false);
    if (patch.view === "matrix" && state.view !== "matrix")
      setMatrixOrigin(state.view);
    setState((s) => ({ ...s, ...patch }));
  };
  const applyChapter = (t: number) => {
    const c = chapterAt(t);
    setState((s) => ({
      ...s,
      ...c.selection,
      view: c.view,
      spacing: c.pose.spacing,
    }));
    setDecode(t >= 74 || (c.id === "cache" && t >= 41.5));
  };
  useEffect(() => {
    if (!playing) return;
    let frame: number;
    let last = performance.now();
    const tick = (now: number) => {
      const elapsed = ((now - last) / 1000) * speed;
      last = now;
      setTime((t) => {
        const next = Math.min(80, t + elapsed);
        if (next === 80) setPlaying(false);
        return next;
      });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, speed]);
  useEffect(() => {
    if (playing) applyChapter(time);
  }, [chapter.id, playing]);
  const seek = (t: number) => {
    setCameraRevision((r) => r + 1);
    setTime(t);
    applyChapter(t);
  };
  useEffect(() => {
    (window as any).__explorer = {
      state,
      time,
      playing,
      ready,
      get camera() {
        return cameraRef.current;
      },
      build,
    };
  }, [state, time, playing, ready]);
  const review = () => {
    const value = JSON.stringify(
      {
        build,
        asset: (import.meta as any).env.VITE_ASSET_NAME || "transformer.glb",
        seed: 1729,
        state,
        time,
        camera: cameraRef.current,
        viewport: [innerWidth, innerHeight],
      },
      null,
      2,
    );
    setContext(value);
    navigator.clipboard?.writeText(value).catch(() => {});
  };
  const restore = () => {
    try {
      const value = JSON.parse(context);
      if (value.build !== build)
        throw Error("This view belongs to another build.");
      if (!value.state || !views.includes(value.state.view))
        throw Error("Unknown view");
      for (const [key, max] of [
        ["layer", 31],
        ["group", 7],
        ["token", 7],
        ["expert", 7],
      ] as const)
        if (
          !Number.isInteger(value.state[key]) ||
          value.state[key] < 0 ||
          value.state[key] > max
        )
          throw Error("Invalid selection");
      if (
        !Number.isFinite(value.time) ||
        value.time < 0 ||
        value.time > 80 ||
        !Number.isFinite(value.state.spacing) ||
        value.state.spacing < 1 ||
        value.state.spacing > 3
      )
        throw Error("Invalid time or spacing");
      if (
        !value.camera ||
        ![value.camera.position, value.camera.target].every(
          (v) =>
            Array.isArray(v) &&
            v.length === 3 &&
            v.every((n) => Number.isFinite(n) && Math.abs(n) < 200),
        )
      )
        throw Error("Invalid camera");
      setPlaying(false);
      setState(value.state);
      setTime(value.time);
      setRestorePose(value.camera);
    } catch (e) {
      setContext(String(e));
    }
  };
  return (
    <>
      <header>
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            change({ view: "overview" });
          }}
        >
          Transformer Explorer
        </a>
        <span>Mixtral 8×7B · A spatial guide</span>
        <button
          onClick={() => {
            setState(initial);
            setTime(0);
            setPlaying(false);
            setCameraRevision((r) => r + 1);
          }}
        >
          Reset
        </button>
      </header>
      <main>
        <section className="exhibit" aria-label="Interactive model">
          <div className="scene-heading">
            <div>
              <small>01 / FOLLOW THE COMPUTATION</small>
              <h1>{labels[state.view]}</h1>
            </div>
            <span className="badge">Illustrative data</span>
          </div>
          <div className="canvas">
            <Scene
              onView={(view) => {
                setCameraRevision((r) => r + 1);
                change({ view });
              }}
              state={state}
              lowQuality={lowQuality}
              cameraRevision={cameraRevision}
              time={time}
              decode={showingDecode}
              playing={playing}
              reduced={reduced}
              top2={data.router.top2}
              cameraRef={cameraRef}
              restorePose={restorePose}
              onReady={setReady}
              onPick={(id, d) => {
                if (/^layer_\d+$/.test(id))
                  change({ layer: d.layer, view: "layer" });
                else if (d.group !== undefined)
                  change({ group: d.group, view: "attention" });
                else if (d.expert !== undefined)
                  change({ expert: d.expert, view: "expert" });
                else
                  change({
                    view: id.includes("router")
                      ? "router"
                      : id.includes("attention")
                        ? "attention"
                        : "layer",
                  });
              }}
            />
            {!ready && (
              <div className="loading" role="status">
                Loading the Blender model…
              </div>
            )}
            <div
              className={
                state.view === "matrix"
                  ? "scene-legend matrix-legend"
                  : "scene-legend"
              }
            >
              {state.view === "overview"
                ? "Depth → 32 sequential layers"
                : state.view === "matrix"
                  ? "Rows: query tokens · Columns: key tokens"
                  : state.view === "cache"
                    ? "Rows: token positions · Columns: sampled head channels"
                    : "Left → right: computation · Depth: parallel alternatives"}
              <br />
              Drag to orbit · Scroll to zoom · Select an object to inspect
            </div>
          </div>
          <div className="location" aria-live="polite">
            Layer {state.layer + 1} / KV group {state.group + 1} / token{" "}
            {state.token + 1}
            <span>{ready ? "Live GLB" : "Loading"}</span>
          </div>
          <div className="locator" aria-label="Layer locator">
            {Array.from({ length: 32 }, (_, i) => (
              <button
                key={i}
                aria-label={`Select layer ${i + 1}`}
                aria-pressed={state.layer === i}
                onClick={() => change({ layer: i, view: "layer" })}
              >
                {i + 1}
              </button>
            ))}
          </div>
          <div className="spatial-controls">
            <label>
              Rendering{" "}
              <select
                aria-label="Rendering detail"
                value={lowQuality ? "reduced" : "standard"}
                onChange={(e) => setLowQuality(e.target.value === "reduced")}
              >
                <option value="standard">Standard</option>
                <option value="reduced">Reduced pixel density</option>
              </select>
            </label>
            <label>
              Stack spacing{" "}
              <input
                aria-label="Stack spacing"
                type="range"
                min="1"
                max="3"
                step=".1"
                value={state.spacing}
                onChange={(e) => change({ spacing: +e.target.value })}
              />
              <output>{state.spacing.toFixed(1)}×</output>
            </label>
            {state.view === "matrix" && (
              <button onClick={() => change({ view: matrixOrigin })}>
                Return to spatial view
              </button>
            )}
            <button onClick={() => change({ view: "layer" })}>
              Back to layer
            </button>
            <button onClick={() => change({ view: "overview" })}>
              Overview
            </button>
          </div>
          <div className="tour">
            <div className="tour-buttons">
              <button
                className="primary"
                onClick={() => {
                  if (time >= 80) seek(0);
                  setPlaying(!playing);
                }}
              >
                {playing ? "Pause tour" : "Play tour"}
              </button>
              <button
                onClick={() => {
                  setPlaying(false);
                  seek(Math.max(0, chapter.start - 1));
                }}
              >
                Previous
              </button>
              <button
                onClick={() => {
                  setPlaying(false);
                  seek(Math.min(79.9, chapter.end));
                }}
              >
                Next
              </button>
              <button onClick={() => setPlaying(false)}>Explore</button>
              <label>
                Speed{" "}
                <select
                  aria-label="Speed"
                  value={speed}
                  onChange={(e) => setSpeed(+e.target.value)}
                >
                  <option value=".5">0.5×</option>
                  <option value="1">1×</option>
                  <option value="1.5">1.5×</option>
                </select>
              </label>
            </div>
            <label className="scrubber">
              Tour position
              <input
                aria-label="Tour position"
                type="range"
                min="0"
                max="80"
                step=".1"
                value={time}
                onChange={(e) => seek(+e.target.value)}
              />
              <output>{time.toFixed(1)} / 80 s</output>
            </label>
            <p className="caption">
              <span className="caption-label">
                Tour chapter: {chapter.title}
              </span>
              {chapter.caption}
            </p>
            <div className="chapters">
              {chapters.map((c, i) => (
                <button
                  key={c.id}
                  aria-label={`Chapter ${i + 1}: ${c.id}`}
                  aria-pressed={chapter.id === c.id}
                  onClick={() => {
                    setPlaying(false);
                    seek(c.start);
                  }}
                >
                  {i + 1}
                </button>
              ))}
            </div>
          </div>
        </section>
        <aside>
          <small>02 / INSPECT & UNDERSTAND</small>
          <h2>Follow one token</h2>
          <p>{explanations[state.view]}</p>
          <nav aria-label="Component views">
            {views.map((v) => (
              <button
                key={v}
                aria-pressed={state.view === v}
                onClick={() => change({ view: v })}
              >
                {labels[v]}
              </button>
            ))}
          </nav>
          <div className="selection">
            <label>
              KV group
              <select
                aria-label="KV group"
                value={state.group}
                onChange={(e) => change({ group: +e.target.value })}
              >
                {Array.from({ length: 8 }, (_, i) => (
                  <option key={i} value={i}>
                    Group {i + 1} · Q {i * 4 + 1}–{i * 4 + 4}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Token
              <select
                aria-label="Token"
                value={state.token}
                onChange={(e) => change({ token: +e.target.value })}
              >
                {tokens.map((t, i) => (
                  <option key={i} value={i}>
                    {i + 1}: {t}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="data-label">
            Illustrative values · seed 1729 · no model inference
          </p>
          {["attention", "matrix"].includes(state.view) && (
            <>
              <h3>Causal attention</h3>
              <p>
                Query {state.token + 1} reads positions 1–{state.token + 1}.
                Future positions are masked.
              </p>
              <div className="table-scroll">
                <table>
                  <caption>Query rows × key columns · 8 × 8 example</caption>
                  <thead>
                    <tr>
                      <th>Q / K</th>
                      {tokens.map((_, i) => (
                        <th key={i}>{i + 1}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.attention.map((row, i) => (
                      <tr
                        key={i}
                        className={i === state.token ? "selected-row" : ""}
                      >
                        <th>
                          <button onClick={() => change({ token: i })}>
                            {i + 1}
                          </button>
                        </th>
                        {row.map((v, j) => (
                          <td
                            key={j}
                            style={{
                              background:
                                j <= i
                                  ? `rgba(100,200,210,${v * 0.6})`
                                  : undefined,
                            }}
                          >
                            {j > i ? "—" : v.toFixed(2)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p>
                Four query heads {state.group * 4 + 1}–{state.group * 4 + 4}{" "}
                share K/V pair {state.group + 1}.
              </p>
              <details>
                <summary>RoPE and attention equation</summary>
                <p>
                  Rotary position embedding rotates paired coordinates in Q and
                  K according to position before forming scores. V is unchanged.
                </p>
                <code>softmax(QKᵀ / √128 + causal mask)V</code>
              </details>
            </>
          )}
          {state.view === "cache" && (
            <>
              <h3>Layer {state.layer + 1} cache</h3>
              {showingDecode && (
                <p>
                  Prompt retained: {tokens.join(" ")}
                  <br />
                  New illustrative chunk: <strong>{chosen.token}</strong> →
                  position 9
                </p>
              )}
              <button
                aria-pressed={showingDecode}
                onClick={() => {
                  setPlaying(false);
                  setDecode(!showingDecode);
                }}
              >
                {showingDecode
                  ? "Decode: 8 retained + 1 new row"
                  : "Prefill: store 8 prompt rows"}
              </button>
              <div className="table-scroll">
                <table>
                  <caption>
                    K activation samples · rows: positions · columns: head
                    channels
                  </caption>
                  <thead>
                    <tr>
                      <th>Position</th>
                      <th>c1</th>
                      <th>c2</th>
                      <th>c3</th>
                      <th>c4</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.cache.keys.map((row, i) => (
                      <tr
                        key={i}
                        className={i === state.token ? "selected-row" : ""}
                      >
                        <th>{i + 1} · retained</th>
                        {row.slice(0, 4).map((v, j) => (
                          <td key={j}>{v.toFixed(2)}</td>
                        ))}
                      </tr>
                    ))}
                    {showingDecode && (
                      <tr className="selected-row">
                        <th>9 · new</th>
                        {data.cache.nextKey.slice(0, 4).map((v, j) => (
                          <td key={j}>{v.toFixed(2)}</td>
                        ))}
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <p>
                K and V are stored separately for each of 8 groups in each of 32
                layers.
              </p>
            </>
          )}
          {["router", "expert"].includes(state.view) && (
            <>
              <h3>Two selected expert outputs</h3>
              <table>
                <caption>Router values for token {state.token + 1}</caption>
                <thead>
                  <tr>
                    <th>Expert</th>
                    <th>Logit</th>
                    <th>Probability</th>
                    <th>Merge weight</th>
                  </tr>
                </thead>
                <tbody>
                  {data.router.logits.map((v, i) => (
                    <tr
                      key={i}
                      className={
                        data.router.top2.includes(i) ? "selected-row" : ""
                      }
                    >
                      <th>
                        <button
                          onClick={() => change({ expert: i, view: "expert" })}
                        >
                          {i + 1}
                        </button>
                      </th>
                      <td>{v.toFixed(2)}</td>
                      <td>{data.router.probabilities[i].toFixed(3)}</td>
                      <td>
                        {data.router.top2.includes(i)
                          ? data.router.weights[
                              data.router.top2.indexOf(i)
                            ].toFixed(3)
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p>
                Expert {data.router.top2[0] + 1} ×{" "}
                {data.router.weights[0].toFixed(3)} + expert{" "}
                {data.router.top2[1] + 1} × {data.router.weights[1].toFixed(3)}.
                These weights sum to one.
              </p>
              <details>
                <summary>Follow the output vectors</summary>
                <p>
                  Eight-channel toy SwiGLU calculation with illustrative
                  weights; these are not trained model values.
                </p>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Channel</th>
                        <th>Expert {data.router.top2[0] + 1}</th>
                        <th>Expert {data.router.top2[1] + 1}</th>
                        <th>Merge</th>
                        <th>+ residual</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.mergedOutput.map((v, c) => (
                        <tr key={c}>
                          <th>{c + 1}</th>
                          <td>
                            {data.expertOutputs[data.router.top2[0]][c].toFixed(
                              3,
                            )}
                          </td>
                          <td>
                            {data.expertOutputs[data.router.top2[1]][c].toFixed(
                              3,
                            )}
                          </td>
                          <td>{v.toFixed(3)}</td>
                          <td>{data.residualOutput[c].toFixed(3)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
              {state.view === "expert" && (
                <details open>
                  <summary>Expert {state.expert + 1} dimensions</summary>
                  <p>
                    Gate and up: 4,096 → 14,336. SiLU(gate) ⊙ up. Down: 14,336 →
                    4,096. Each expert has distinct learned weights; the exhibit
                    assigns no fixed subject specialty.
                  </p>
                </details>
              )}
            </>
          )}
          {state.view === "input" && (
            <>
              <h3>Embedding lookup</h3>
              <p>Vocabulary: 32,000 entries. Hidden width: 4,096.</p>
              <div className="vector">
                {data.embedding.slice(0, 8).map((v, i) => (
                  <span key={i}>{v.toFixed(2)}</span>
                ))}
              </div>
              <p>
                Eight sampled channels of the selected token representation.
              </p>
            </>
          )}
          {state.view === "output" && (
            <>
              <h3>Candidate next tokens</h3>
              <p>
                Illustrative greedy choice: <strong>{chosen.token}</strong>, the
                displayed candidate with the highest logit.
              </p>
              <p>
                Probabilities are normalized over the five displayed
                illustrative candidates only.
              </p>
              <table>
                <thead>
                  <tr>
                    <th>Chunk</th>
                    <th>Logit</th>
                    <th>Probability</th>
                  </tr>
                </thead>
                <tbody>
                  {data.candidates.map((c) => (
                    <tr key={c.token}>
                      <th>{c.token}</th>
                      <td>{c.logit.toFixed(2)}</td>
                      <td>{c.probability.toFixed(3)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button
                onClick={() => {
                  setDecode(true);
                  change({ view: "cache" });
                }}
              >
                Follow the next decode step
              </button>
            </>
          )}
          {["overview", "layer"].includes(state.view) && (
            <div className="facts">
              <p>
                <strong>32</strong> sequential layers
              </p>
              <p>
                <strong>32 Q / 8 KV</strong> heads per layer
              </p>
              <p>
                <strong>2 of 8</strong> experts per token per layer
              </p>
              <details>
                <summary>Residuals and normalization</summary>
                <p>
                  x → RMSNorm → attention → add x → RMSNorm → MoE → add
                  attention-stage residual. RMSNorm uses root mean square
                  scaling and a learned scale vector.
                </p>
              </details>
            </div>
          )}
          {reviewEnabled && (
            <details className="review">
              <summary>Development view context</summary>
              <p>
                Build {build}. Copy this state with feedback, or paste a saved
                view to restore it.
              </p>
              <button onClick={review}>Copy current view</button>
              <textarea
                aria-label="View context"
                value={context}
                onChange={(e) => setContext(e.target.value)}
              />
              <button onClick={restore}>Restore view</button>
            </details>
          )}
        </aside>
      </main>
      <footer>
        Generated in Blender · Navigated live in Three.js · Illustrative Mixtral
        architecture
      </footer>
    </>
  );
}
