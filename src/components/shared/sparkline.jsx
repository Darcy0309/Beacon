/**
 * Small line + gradient-area chart used inside stat tiles.
 * `values` is a plain number array; the line is drawn in `color`.
 */
export default function Sparkline({ values = [], color = "var(--primary)", className, bars = false }) {
  const data = values.length ? values : [0, 0];
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const span = max - min || 1;

  const W = 220;
  const H = 64;
  const x = (i) => (i * W) / Math.max(1, data.length - 1);
  const y = (v) => H - 4 - ((v - min) / span) * (H - 10);

  // Stable id so two sparklines on a page never share a gradient. The colour
  // has to be part of it: tiles often plot the same series in different hues,
  // and SVG resolves url(#id) to whichever gradient was defined first — so a
  // green tile would otherwise paint itself with an amber tile's fill.
  const seed = `${color}|${data.join(",")}|${H}`;
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  const id = `spark-${hash.toString(36)}`;

  if (bars) {
    const bw = W / (data.length * 1.6);
    return (
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className={className} aria-hidden>
        {data.map((v, i) => {
          const h = Math.max(2, ((v - min) / span) * (H - 8));
          return (
            <rect
              key={i}
              x={(i * W) / data.length + bw * 0.3}
              y={H - h}
              width={bw}
              height={h}
              rx="1.5"
              fill={color}
              opacity={0.55 + (0.45 * i) / Math.max(1, data.length - 1)}
            />
          );
        })}
      </svg>
    );
  }

  const pts = data.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`);
  const line = `M${pts.join(" L")}`;
  const area = `${line} L${W},${H} L0,${H} Z`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className={className} aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.35" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${id})`} />
      <path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
