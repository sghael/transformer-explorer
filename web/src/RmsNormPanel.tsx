import { useMemo } from "react";
import { architecture } from "./data";
import { inspectRmsNorm } from "./inspection";

export type RmsNormDepth = "operation" | "vector" | "scalar";
export type RmsNormPanelProps = {
  component: "norm1" | "norm2" | "final_norm";
  layer: number;
  token: number;
  depth: RmsNormDepth;
  channel: number;
  onDepthChange: (depth: RmsNormDepth) => void;
  onChannelChange: (channel: number) => void;
  onClose: () => void;
};

export default function RmsNormPanel({
  component,
  layer,
  token,
  depth,
  channel,
  onDepthChange,
  onChannelChange,
  onClose,
}: RmsNormPanelProps) {
  const stage =
    component === "final_norm" ? "final" : component === "norm1" ? 1 : 2;
  const rms = useMemo(
    () => inspectRmsNorm(layer, token, stage),
    [layer, token, stage],
  );
  const name = stage === "final" ? "Final RMSNorm" : `RMSNorm ${stage}`;
  const location = stage === "final" ? "Model output" : `Layer ${layer + 1}`;
  return (
    <section className="rms-inspection" aria-label="RMSNorm inspection">
      <nav className="inspection-breadcrumb" aria-label="Inspection path">
        <button onClick={onClose}>{location}</button>
        <span>→</span>
        <button onClick={() => onDepthChange("operation")}>{name}</button>
        {depth !== "operation" && (
          <>
            <span>→</span>
            <button onClick={() => onDepthChange("vector")}>
              Activation vector
            </button>
          </>
        )}
        {depth === "scalar" && (
          <>
            <span>→</span>
            <span>Channel {channel + 1}</span>
          </>
        )}
      </nav>
      <h3>{name}: scale an activation vector</h3>
      <p>
        {stage === "final"
          ? "After all 32 decoder layers, final RMSNorm scales the hidden vector before the language-model projection produces vocabulary logits. Its learned scales belong to the whole model."
          : stage === 1
            ? "This pre-normalization scales the residual vector before attention. Attention's result is then added to the original residual vector."
            : "This pre-normalization scales the updated residual vector before the mixture-of-experts block. The block's result is then added to that residual vector."}
      </p>
      <p className="formula" aria-label="Position in model computation">
        {stage === "final"
          ? "logits = LM projection(RMSNorm_final(h_final))"
          : stage === 1
            ? "h = x + Attention(RMSNorm₁(x))"
            : "out = h + MoE(RMSNorm₂(h))"}
      </p>
      <p>
        RMSNorm divides every channel by one shared root mean square
        denominator, then multiplies each channel by its learned scale γ. The
        circular badge represents this operation; its size is schematic.
      </p>
      <p className="formula">yᵢ = γᵢ × xᵢ / √(mean(x²) + ε)</p>
      <p>
        This model normalizes {architecture.hidden_size} channels for each token
        separately. This complete <strong>8-channel illustrative vector</strong>{" "}
        uses a mean over 8. Its activations and scales are teaching values, not
        samples from the model.
      </p>
      <p>
        Token {token + 1} · {location.toLowerCase()} · ε = 0.00001.
      </p>
      <dl className="rms-calculation">
        <div>
          <dt>Mean of the eight squared values</dt>
          <dd>
            ({rms.squares.map((value) => value.toFixed(4)).join(" + ")}) / 8 ={" "}
            <strong>{rms.meanSquares.toFixed(6)}</strong>
          </dd>
        </div>
        <div>
          <dt>Stability constant ε</dt>
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
      <button onClick={() => onDepthChange("vector")}>
        Inspect activation vector
      </button>
      <div className="rms-vector-table">
        <table aria-label="Eight-channel RMSNorm calculation">
          <thead>
            <tr>
              <th scope="col">Channel</th>
              <th scope="col">Input x</th>
              <th scope="col">x²</th>
              <th scope="col">Scale γ</th>
              <th scope="col">Output y</th>
            </tr>
          </thead>
          <tbody>
            {rms.values.map((value, index) => (
              <tr key={index}>
                <th scope="row">
                  <button
                    aria-label={`Inspect channel ${index + 1}`}
                    aria-pressed={depth === "scalar" && channel === index}
                    onClick={() => {
                      onChannelChange(index);
                      onDepthChange("scalar");
                    }}
                  >
                    {index + 1}
                  </button>
                </th>
                <td>{value.toFixed(2)}</td>
                <td>{rms.squares[index].toFixed(4)}</td>
                <td>{rms.gamma[index].toFixed(2)}</td>
                <td>{rms.output[index].toFixed(6)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {depth === "scalar" && (
        <>
          <h4>Channel {channel + 1}: one activation value</h4>
          <p>
            An activation channel holds one scalar value at this point in the
            computation. The learned scale γ is a weight; x and y are runtime
            values.
          </p>
          <dl className="rms-calculation">
            <div>
              <dt>Input xᵢ</dt>
              <dd>{rms.values[channel].toFixed(2)}</dd>
            </div>
            <div>
              <dt>Squared input xᵢ²</dt>
              <dd>{rms.squares[channel].toFixed(4)}</dd>
            </div>
            <div>
              <dt>Illustrative learned scale γᵢ</dt>
              <dd>{rms.gamma[channel].toFixed(2)}</dd>
            </div>
            <div>
              <dt>Output yᵢ</dt>
              <dd>
                {rms.gamma[channel].toFixed(2)} ×{" "}
                {rms.values[channel].toFixed(2)} / {rms.denominator.toFixed(6)}{" "}
                = <strong>{rms.output[channel].toFixed(6)}</strong>
              </dd>
            </div>
          </dl>
        </>
      )}
      <p className="data-label">
        Illustrative calculation · seed 1729 · no model inference. Displayed
        results are rounded.
      </p>
      <p>
        <a
          href={
            stage === "final"
              ? "https://github.com/mistralai/mistral-inference/blob/main/src/mistral_inference/transformer.py"
              : "https://github.com/mistralai/mistral-inference/blob/main/src/mistral_inference/transformer_layers.py#L151-L154"
          }
        >
          Mistral inference source
        </a>
      </p>
      <button onClick={onClose}>Close RMSNorm inspection</button>
    </section>
  );
}
