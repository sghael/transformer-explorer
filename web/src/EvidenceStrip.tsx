export type EvidenceRow = {
  id: string;
  label: string;
  value: number;
  masked?: boolean;
};

/** All rows use the same probability domain; the accompanying number is primary. */
export function ProbabilityBar({
  value,
  masked = false,
  selected = false,
}: {
  value: number;
  masked?: boolean;
  selected?: boolean;
}) {
  return (
    <span
      className={`evidence-number${selected ? " evidence-selected" : ""}${masked ? " evidence-masked" : ""}`}
      data-value={value}
      data-masked={masked}
    >
      <svg
        className="evidence-bar"
        viewBox="0 0 100 16"
        preserveAspectRatio="none"
        aria-hidden="true"
        focusable="false"
      >
        <path className="evidence-baseline" d="M0 5V11M0 8H100M100 5V11" />
        {!masked && (
          <rect
            x="0"
            y="5"
            width={value * 100}
            height="6"
            fill="currentColor"
          />
        )}
      </svg>
      <span className="evidence-value">
        {masked && (
          <span className="evidence-mask" aria-label="Future position masked">
            ×{" "}
          </span>
        )}
        {value.toFixed(3)}
      </span>
    </span>
  );
}

export function ProbabilityScale() {
  return (
    <span
      className="evidence-scale"
      aria-label="All bars use the same scale from zero to one"
    >
      <span>0</span>
      <span>1</span>
    </span>
  );
}

export default function EvidenceStrip({
  label,
  rows,
}: {
  label: string;
  rows: EvidenceRow[];
}) {
  return (
    <figure className="evidence-strip" aria-label={label}>
      <figcaption>
        <span>{label}</span>
        <ProbabilityScale />
      </figcaption>
      <ol>
        {rows.map((row) => (
          <li key={row.id}>
            <span className="evidence-key">{row.label}</span>
            <ProbabilityBar value={row.value} masked={row.masked} />
          </li>
        ))}
      </ol>
    </figure>
  );
}
