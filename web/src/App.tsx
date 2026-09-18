import { useEffect, useMemo, useRef, useState } from "react";
import Scene, {
  type CameraPose,
  type Selection,
  type ContextMode,
} from "./Scene";
import { flowDescription } from "./Flow";
import { representativeLayers, representativeLayer } from "./layout";
import { inspectRmsNorm } from "./inspection";
import EvidenceStrip, {
  ProbabilityBar,
  ProbabilityScale,
} from "./EvidenceStrip";
import {
  sample,
  tokens,
  chapters,
  chapterAt,
  architecture,
  type View,
} from "./data";
const initial: Selection = {
  layer: 15,
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
    "The model has 32 decoder layers with distinct learned weights. This overview compresses the other 31 layers and explains one representative interior. Choose the first, middle or last layer; computation runs left to right, and depth separates parallel heads and experts.",
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
type ShapeExplanation = {
  title: string;
  kind: string;
  role: string;
  dimensions: string;
  arrangement: string;
};
const number = (value: number) => value.toLocaleString("en-US");
const hidden = number(architecture.hidden_size);
const intermediate = number(architecture.intermediate_size);
const vocabulary = number(architecture.vocab_size);
const head = number(architecture.head_dim);
const queriesPerGroup = architecture.attention_heads / architecture.kv_heads;
function explainShape(selection: Selection, decode: boolean): ShapeExplanation {
  const layer = selection.layer + 1;
  const explanations: Record<View, ShapeExplanation> = {
    overview: {
      title: "One representative decoder layer",
      kind: "Repeated computation",
      role: "One interior explains the architecture repeated across 32 layers. The other 31 layers are compressed; their learned weights are distinct.",
      dimensions: `${architecture.num_layers} sequential layers; ${hidden} activation channels per token.`,
      arrangement:
        "First, middle and last select layers 1, 16 and 32 in the same representative frame. Depth separates parallel heads and experts. Positions do not depict physical memory.",
    },
    input: {
      title: "Token embedding table",
      kind: "Learned weights → activation",
      role: "The matrix sheet represents a lookup table. A token ID selects one row to form a vector.",
      dimensions: `${vocabulary} vocabulary rows × ${hidden} channels. One lookup returns ${hidden} numbers.`,
      arrangement:
        "Vocabulary rows are possible token IDs; the displayed token sequence has separate position indices.",
    },
    layer: {
      title: `Layer ${layer}: residual stream`,
      kind: "Activations and operations",
      role: "Connections carry tensors between operations. Circular RMSNorm badges rescale each token vector; attention and the expert network transform it; each + junction adds the bypassed vector.",
      dimensions: `${hidden} channels enter and leave each sublayer. Both residual additions preserve this width.`,
      arrangement:
        "The representative interior stays in one frame and computes along +X. Choosing a layer changes its illustrative values; real layers have distinct learned weights. Attention groups and expert alternatives separate in depth.",
    },
    attention: {
      title: `Group ${selection.group + 1}: Q / K / V projections`,
      kind: "Learned projection weights",
      role: "Each learned matrix maps an activation into a query, key or value vector. Q and K produce per-head attention weights; each head uses those weights to combine the shared V vectors. The score panel displays one illustrative head from this four-head group.",
      dimensions: `${hidden} → ${head} channels per head (${head} × ${hidden} weights). ${architecture.attention_heads} Q heads share ${architecture.kv_heads} K/V pairs.`,
      arrangement: `${queriesPerGroup} Q sheets share this K/V pair. The attention table compares token positions; its rows and columns do not represent additional heads.`,
    },
    cache: {
      title: `Layer ${layer} / group ${selection.group + 1}: K/V cache`,
      kind: "Stored activations",
      role: "Separate K and V sheets retain earlier token vectors. A new row appears for the next decoded position.",
      dimensions: `${tokens.length + (decode ? 1 : 0)} positions × ${head} channels per sheet in this example; only sampled channels are drawn.`,
      arrangement: `Rows are positions. Each of ${architecture.kv_heads} groups has its own K/V entries in each of ${architecture.num_layers} layers.`,
    },
    router: {
      title: `Layer ${layer}: router and expert bank`,
      kind: "Learned weights and parallel operations",
      role: "The router scores alternatives. Each expert enclosure represents a full transformation; two output vectors travel to the merge.",
      dimensions: `Router: ${hidden} → ${architecture.experts} scores. ${architecture.experts_per_token} selected experts each return ${hidden} channels.`,
      arrangement:
        "Depth separates expert alternatives. Connector length and expert size do not represent routing probability.",
    },
    expert: {
      title: `Expert ${selection.expert + 1}: three projections`,
      kind: "Learned weights and operations",
      role: "Gate and up sheets project the same input. SiLU transforms the gate, multiplication joins the branches, and the down sheet produces the output.",
      dimensions: `Gate / up: ${hidden} → ${intermediate} each. Down: ${intermediate} → ${hidden}.`,
      arrangement:
        "The two branches run in parallel. Each sheet represents a matrix; the small operation nodes contain no weight matrix.",
    },
    matrix: {
      title: `Group ${selection.group + 1}: attention weights`,
      kind: "Runtime values",
      role: "The grid shows how much each query position uses each key position. The highlighted row belongs to the selected query token.",
      dimensions: `${tokens.length} query positions × ${tokens.length} key positions in this example. Each associated value vector has ${head} channels.`,
      arrangement:
        "Rows and columns index positions. Masked future cells contribute zero weight.",
    },
    output: {
      title: "Final normalization and vocabulary projection",
      kind: "Operation and learned weights",
      role: "Final normalization rescales the vector. The LM-head matrix maps it to vocabulary scores; the next-token marker represents the chosen token ID.",
      dimensions: `LM head: ${hidden} → ${vocabulary} logits (${vocabulary} × ${hidden} weights).`,
      arrangement:
        "A logit belongs to a vocabulary entry. It is separate from the position where the chosen token is appended.",
    },
  };
  return explanations[selection.view];
}
const build = (import.meta as any).env.VITE_BUILD_ID || "development";
const reviewEnabled =
  (import.meta as any).env.VITE_REVIEW === "1" || (import.meta as any).env.DEV;
export default function App() {
  const [state, setState] = useState<Selection>(initial);
  const [cameraRevision, setCameraRevision] = useState(0);
  const [lowQuality, setLowQuality] = useState(false);
  const [contextMode, setContextMode] = useState<ContextMode>("muted");
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [flowTime, setFlowTime] = useState(0);
  const [flowPlaying, setFlowPlaying] = useState(false);
  const [inspectedComponent, setInspectedComponent] = useState<
    "norm1" | "norm2" | null
  >(null);
  const [inspectionDepth, setInspectionDepth] = useState<
    "operation" | "vector" | "scalar"
  >("operation");
  const [inspectionChannel, setInspectionChannel] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [ready, setReady] = useState<any>(null);
  const [context, setContext] = useState("");
  const [restorePose, setRestorePose] = useState<CameraPose | null>(null);
  const [decode, setDecode] = useState<boolean | null>(null);
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
    state.view === "cache" && (flowPlaying || flowTime > 0)
      ? flowTime >= 6
      : (decode ?? ((time >= 41.5 && time < 45) || time >= 74));
  const rms = useMemo(
    () =>
      inspectRmsNorm(
        state.layer,
        state.token,
        inspectedComponent === "norm2" ? 2 : 1,
      ),
    [state.layer, state.token, inspectedComponent],
  );
  const shape = explainShape(state, showingDecode);
  const change = (patch: Partial<Selection>) => {
    setPlaying(false);
    setFlowPlaying(false);
    setFlowTime(0);
    if (patch.view && patch.view !== "layer") setInspectedComponent(null);
    if (patch.view === "matrix" && state.view !== "matrix")
      setMatrixOrigin(state.view);
    setState((s) => ({
      ...s,
      ...patch,
      layer: representativeLayer(patch.layer ?? s.layer),
      spacing: 1,
    }));
  };
  const applyChapter = (t: number) => {
    setFlowPlaying(false);
    setFlowTime(0);
    setInspectedComponent(null);
    const c = chapterAt(t);
    setState((s) => ({
      ...s,
      ...c.selection,
      view: c.view,
      layer: representativeLayer(c.selection.layer ?? s.layer),
      spacing: 1,
    }));
    setDecode(null);
  };
  useEffect(() => {
    if (!flowPlaying) return;
    let frame: number;
    let previous = performance.now();
    const tick = (now: number) => {
      const elapsed = (now - previous) / 1000;
      previous = now;
      setFlowTime((value) => (value + elapsed) % 12);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [flowPlaying]);
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
      flowTime,
      flowPlaying,
      contextMode,
      ready,
      get camera() {
        return cameraRef.current;
      },
      build,
    };
  }, [state, time, playing, flowTime, flowPlaying, contextMode, ready]);
  const review = () => {
    const value = JSON.stringify(
      {
        build,
        asset: (import.meta as any).env.VITE_ASSET_NAME || "transformer.glb",
        seed: 1729,
        layoutVersion: 2,
        state,
        time,
        decode: showingDecode,
        flowTime,
        flowPlaying,
        inspectedComponent,
        inspectionDepth,
        inspectionChannel,
        lowQuality,
        contextMode,
        speed,
        matrixOrigin,
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
      if (
        typeof value.decode !== "boolean" ||
        typeof value.lowQuality !== "boolean" ||
        ![0.5, 1, 1.5].includes(value.speed) ||
        !views.includes(value.matrixOrigin)
      )
        throw Error("Invalid presentation state");
      if (
        !Number.isFinite(value.flowTime) ||
        value.flowTime < 0 ||
        value.flowTime >= 12 ||
        typeof value.flowPlaying !== "boolean"
      )
        throw Error("Invalid flow state");
      if (
        ![null, "norm1", "norm2"].includes(value.inspectedComponent) ||
        !["operation", "vector", "scalar"].includes(value.inspectionDepth) ||
        !Number.isInteger(value.inspectionChannel) ||
        value.inspectionChannel < 0 ||
        value.inspectionChannel >= 8
      )
        throw Error("Invalid inspection state");
      const restoredContextMode =
        value.contextMode === undefined ? "muted" : value.contextMode;
      if (!["full", "muted", "isolated"].includes(restoredContextMode))
        throw Error("Invalid surroundings mode");
      setContextMode(restoredContextMode);
      setPlaying(false);
      setFlowPlaying(false);
      setFlowTime(value.flowTime);
      setInspectedComponent(value.inspectedComponent);
      setInspectionDepth(value.inspectionDepth);
      setInspectionChannel(value.inspectionChannel);
      setDecode(value.decode);
      setLowQuality(value.lowQuality);
      setSpeed(value.speed);
      setMatrixOrigin(value.matrixOrigin);
      setState({
        ...value.state,
        layer: representativeLayer(value.state.layer),
        spacing: 1,
      });
      setTime(value.time);
      setRestorePose(value.layoutVersion === 2 ? value.camera : null);
      setCameraRevision((revision) => revision + 1);
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
            setDecode(null);
            setFlowPlaying(false);
            setFlowTime(0);
            setInspectedComponent(null);
            setInspectionDepth("operation");
            setInspectionChannel(0);
            setLowQuality(false);
            setContextMode("muted");
            setSpeed(1);
            setRestorePose(null);
            setMatrixOrigin("attention");
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
              contextMode={contextMode}
              cameraRevision={cameraRevision}
              time={time}
              flowTime={flowTime}
              flowPlaying={flowPlaying}
              decode={showingDecode}
              playing={playing}
              reduced={reduced}
              top2={data.router.top2}
              cameraRef={cameraRef}
              restorePose={restorePose}
              onReady={setReady}
              onPick={(id, d) => {
                const patch: Partial<Selection> = {};
                if (Number.isInteger(d.layer) && d.layer >= 0 && d.layer < 32)
                  patch.layer = d.layer;
                if (d.group !== undefined) patch.group = d.group;
                if (d.expert !== undefined) patch.expert = d.expert;
                patch.view =
                  id === "input" || id === "embedding"
                    ? "input"
                    : ["final_norm", "lm_head", "output"].includes(id)
                      ? "output"
                      : id.startsWith("cache_")
                        ? "cache"
                        : d.expert !== undefined
                          ? "expert"
                          : id.includes("router")
                            ? "router"
                            : d.group !== undefined || id.includes("attention")
                              ? "attention"
                              : "layer";
                change(patch);
                if (id === "norm1" || id === "norm2") {
                  setInspectedComponent(id);
                  setInspectionDepth("operation");
                } else setInspectedComponent(null);
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
                ? "Left → right (+X): computation · One representative layer; 31 compressed"
                : state.view === "matrix"
                  ? "Rows: query tokens · Columns: key tokens"
                  : state.view === "cache"
                    ? "Rows: token positions · Columns: sampled head channels"
                    : "Left → right (+X): computation · Depth: parallel heads / experts"}
              <br />
              Drag to orbit · Scroll to zoom · Select an object to inspect
            </div>
          </div>
          <div className="location" aria-live="polite">
            Layer {state.layer + 1} / KV group {state.group + 1} / token{" "}
            {state.token + 1}
            <span>{ready ? "Live GLB" : "Loading"}</span>
          </div>
          <div className="spatial-controls">
            <label>
              Layer{" "}
              <select
                aria-label="Layer"
                value={state.layer}
                onChange={(event) =>
                  change({ layer: Number(event.target.value), view: "layer" })
                }
              >
                {representativeLayers.map((layer, index) => (
                  <option key={layer} value={layer}>
                    {["First", "Middle", "Last"][index]} · {layer + 1}
                  </option>
                ))}
              </select>
            </label>
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
            {reviewEnabled && (
              <label>
                Surroundings{" "}
                <select
                  aria-label="Surroundings"
                  aria-describedby="surroundings-note"
                  value={contextMode}
                  onChange={(event) =>
                    setContextMode(event.target.value as ContextMode)
                  }
                >
                  <option value="full">Full context</option>
                  <option value="muted">Muted context</option>
                  <option value="isolated">Hide surroundings</option>
                </select>
              </label>
            )}
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
          {reviewEnabled && (
            <p id="surroundings-note" className="surroundings-note">
              Hide surroundings isolates the focus; connections continue outside
              it.
            </p>
          )}
          <div className="flow-controls" aria-label="Flow demonstration">
            <div>
              <button
                aria-pressed={flowPlaying}
                onClick={() => {
                  setPlaying(false);
                  setFlowPlaying((value) => !value);
                }}
              >
                {flowPlaying ? "Pause flow" : "Animate flow"}
              </button>
              <button
                onClick={() => {
                  setPlaying(false);
                  setFlowPlaying(false);
                  setFlowTime((value) => (value + 1) % 12);
                }}
              >
                Step flow
              </button>
              <output>{flowTime.toFixed(1)} / 12 s</output>
            </div>
            <p>
              {flowDescription(state.view, flowTime)} . This repeating
              demonstration is separate from model inference and the guided
              tour.
            </p>
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
          <section
            className="shape-explanation"
            aria-label="Selected component shape and dimensions"
          >
            <span className="shape-kind">{shape.kind}</span>
            <h3>{shape.title}</h3>
            <p>{shape.role}</p>
            <dl>
              <div>
                <dt>Dimensions</dt>
                <dd>{shape.dimensions}</dd>
              </div>
              <div>
                <dt>Spatial meaning</dt>
                <dd>{shape.arrangement}</dd>
              </div>
            </dl>
            <p className="shape-scale">
              Open frames enclose subgraphs. Circular RMSNorm badges and other
              solid nodes apply operations. Matrix panels hold learned weights
              or runtime arrays, identified by their labels. Moving points,
              bundles and grids represent token IDs, vectors and tensors.
            </p>
            <p className="shape-scale">
              Geometry is schematic. Shape size, thickness and displayed cells
              do not encode parameter counts or computational cost.
            </p>
          </section>
          <p className="data-label">
            Illustrative values · seed 1729 · no model inference
          </p>
          {state.view === "layer" && (
            <section className="rms-inspection" aria-label="RMSNorm inspection">
              <button
                onClick={() => {
                  setInspectedComponent("norm1");
                  setInspectionDepth("operation");
                }}
              >
                Inspect RMSNorm
              </button>
              {inspectedComponent && (
                <>
                  <nav
                    className="inspection-breadcrumb"
                    aria-label="Inspection path"
                  >
                    <button onClick={() => change({ view: "overview" })}>
                      Model
                    </button>
                    <span>→</span>
                    <button onClick={() => setInspectedComponent(null)}>
                      Layer {state.layer + 1}
                    </button>
                    <span>→</span>
                    <button onClick={() => setInspectionDepth("operation")}>
                      RMSNorm {inspectedComponent === "norm1" ? 1 : 2}
                    </button>
                    {inspectionDepth !== "operation" && (
                      <>
                        <span>→</span>
                        <button onClick={() => setInspectionDepth("vector")}>
                          Activation vector
                        </button>
                      </>
                    )}
                    {inspectionDepth === "scalar" && (
                      <>
                        <span>→</span>
                        <span>Channel {inspectionChannel + 1}</span>
                      </>
                    )}
                  </nav>
                  <h3>
                    RMSNorm {inspectedComponent === "norm1" ? 1 : 2}: scale an
                    activation vector
                  </h3>
                  <p>
                    The circular badge represents an operation, with a schematic
                    size. RMSNorm divides all channels by one root mean square
                    denominator, then applies a learned scale γ to each channel.
                  </p>
                  <p className="formula">yᵢ = γᵢ × xᵢ / √(mean(x²) + ε)</p>
                  <p>
                    This model uses {hidden} channels. The worked calculation
                    below uses a complete{" "}
                    <strong>8-channel illustrative vector</strong>, so its mean
                    divides by 8.
                  </p>
                  <button onClick={() => setInspectionDepth("vector")}>
                    Inspect activation vector
                  </button>
                  {inspectionDepth !== "operation" && (
                    <>
                      <p>
                        Token {state.token + 1} · layer {state.layer + 1}.
                        Select one scalar channel:
                      </p>
                      <div
                        className="activation-channels"
                        role="group"
                        aria-label="Activation channels"
                      >
                        {rms.values.map((value, channel) => (
                          <button
                            key={channel}
                            aria-label={`Inspect channel ${channel + 1}`}
                            aria-pressed={
                              inspectionDepth === "scalar" &&
                              inspectionChannel === channel
                            }
                            onClick={() => {
                              setInspectionChannel(channel);
                              setInspectionDepth("scalar");
                            }}
                          >
                            <span>x{channel + 1}</span>
                            <strong>{value.toFixed(2)}</strong>
                          </button>
                        ))}
                      </div>
                      <dl className="rms-calculation">
                        <div>
                          <dt>Mean of the eight squared values</dt>
                          <dd>
                            (
                            {rms.squares
                              .map((value) => value.toFixed(4))
                              .join(" + ")}
                            ) / 8 ={" "}
                            <strong>{rms.meanSquares.toFixed(6)}</strong>
                          </dd>
                        </div>
                        <div>
                          <dt>Illustrative stability constant ε</dt>
                          <dd>{rms.epsilon}</dd>
                        </div>
                        <div>
                          <dt>Shared denominator</dt>
                          <dd>
                            √({rms.meanSquares.toFixed(6)} + {rms.epsilon}) ={" "}
                            <strong>{rms.denominator.toFixed(6)}</strong>
                          </dd>
                        </div>
                      </dl>
                    </>
                  )}
                  {inspectionDepth === "scalar" && (
                    <>
                      <h4>
                        Channel {inspectionChannel + 1}: one activation value
                      </h4>
                      <p>
                        An activation channel holds a scalar number at this
                        position in the computation. It is not a separate
                        neuron-shaped object. The learned scale is a weight; x
                        and y are runtime values.
                      </p>
                      <dl className="rms-calculation">
                        <div>
                          <dt>Input xᵢ</dt>
                          <dd>{rms.values[inspectionChannel].toFixed(2)}</dd>
                        </div>
                        <div>
                          <dt>Squared input xᵢ²</dt>
                          <dd>{rms.squares[inspectionChannel].toFixed(4)}</dd>
                        </div>
                        <div>
                          <dt>Illustrative learned scale γᵢ</dt>
                          <dd>{rms.gamma[inspectionChannel].toFixed(2)}</dd>
                        </div>
                        <div>
                          <dt>Output yᵢ</dt>
                          <dd>
                            {rms.gamma[inspectionChannel].toFixed(2)} ×{" "}
                            {rms.values[inspectionChannel].toFixed(2)} /{" "}
                            {rms.denominator.toFixed(6)} ={" "}
                            <strong>
                              {rms.output[inspectionChannel].toFixed(6)}
                            </strong>
                          </dd>
                        </div>
                      </dl>
                    </>
                  )}
                </>
              )}
            </section>
          )}
          {["attention", "matrix"].includes(state.view) && (
            <>
              <h3>Causal attention</h3>
              <EvidenceStrip
                label={`Query ${state.token + 1} · weights by key position`}
                rows={data.attention[state.token].map((value, key) => ({
                  id: `key-${key}`,
                  label: `K${key + 1} · ${tokens[key]}`,
                  value,
                  masked: key > state.token,
                }))}
              />
              <div className="table-scroll">
                <table className="attention-evidence-table">
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
                  setFlowPlaying(false);
                  setFlowTime(0);
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
              <table className="router-evidence-table">
                <caption>
                  Token {state.token + 1} · all {architecture.experts} routing
                  alternatives
                </caption>
                <thead>
                  <tr>
                    <th>Expert</th>
                    <th>Logit</th>
                    <th>
                      Probability
                      <ProbabilityScale />
                    </th>
                    <th>
                      Normalized
                      <br />
                      merge weight
                    </th>
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
                        {data.router.top2.includes(i) && (
                          <span
                            className="expert-selected-mark"
                            aria-label="Selected expert"
                          >
                            {" "}
                            ✓
                          </span>
                        )}
                      </th>
                      <td>{v.toFixed(2)}</td>
                      <td>
                        <ProbabilityBar
                          value={data.router.probabilities[i]}
                          selected={data.router.top2.includes(i)}
                        />
                      </td>
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
                Selected probabilities are renormalized over this pair; these
                merge weights sum to one.
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
