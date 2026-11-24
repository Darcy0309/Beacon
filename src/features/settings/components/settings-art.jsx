/**
 * A settings area's picture (client, Nov 2026: "left show an image that shows the meaning of the card"): a small scene
 * for each area, drawn in the site's own accent (it follows the theme and colour), shown when the tile is pointed at.
 * Lines in the accent, fills in tints of it, a part or two that moves gently.
 */

const line = { fill: "none", stroke: "var(--primary)", strokeWidth: 3, strokeLinecap: "round", strokeLinejoin: "round" };
const soft = { fill: "color-mix(in srgb, var(--primary) 14%, transparent)" };
const mid = { fill: "color-mix(in srgb, var(--primary) 32%, transparent)" };
const strong = { fill: "var(--primary)" };
const paper = { fill: "var(--card)" };

const SCENES = {
  // Company & Sign-in: the office, a shield with a lock on it, and a key.
  building: (
    <>
      <rect x="14" y="34" width="50" height="70" rx="6" style={soft} />
      <rect x="14" y="34" width="50" height="70" rx="6" style={line} />
      {[46, 62, 78].map((y) => [24, 44].map((x) => <rect key={`${x}-${y}`} x={x} y={y} width="10" height="9" rx="2" style={mid} />))}
      <path d="M33 104v-12h12v12" style={line} />
      <path d="M84 30l22 8v18c0 16-10 26-22 31-12-5-22-15-22-31V38z" style={paper} />
      <path d="M84 30l22 8v18c0 16-10 26-22 31-12-5-22-15-22-31V38z" style={line} />
      <rect x="75" y="54" width="18" height="15" rx="3" style={strong} />
      <path d="M78 54v-5a6 6 0 0 1 12 0v5" style={line} />
      <g className="art-float"><circle cx="98" cy="98" r="6" style={line} /><path d="M92 98H74M80 98v6M86 98v4" style={line} /></g>
    </>
  ),
  // Dashboard: a screen of panels, bars rising and a line through them.
  layout: (
    <>
      <rect x="10" y="16" width="100" height="74" rx="8" style={soft} />
      <rect x="10" y="16" width="100" height="74" rx="8" style={line} />
      <rect x="18" y="24" width="38" height="24" rx="4" style={mid} />
      <rect x="62" y="24" width="40" height="24" rx="4" style={paper} />
      <path d="M66 42l8-8 7 5 9-10 8 6" style={line} />
      {[[22, 20], [34, 30], [46, 14], [58, 26], [70, 34], [82, 22], [94, 30]].map(([x, h], i) => (
        <rect key={x} className="art-bar" style={{ ...strong, animationDelay: `${i * 90}ms` }} x={x - 4} y={82 - h} width="8" height={h} rx="2" />
      ))}
      <path d="M48 90v12M72 90v12M38 104h44" style={line} />
    </>
  ),
  // Phone: a handset, sound waves, and a recording light on a waveform.
  phone: (
    <>
      <circle cx="60" cy="60" r="46" style={soft} />
      <path d="M38 30c4-3 9-2 11 2l6 11c2 4 1 8-2 10l-5 4c4 9 11 16 20 20l4-5c2-3 6-4 10-2l11 6c4 2 5 7 2 11l-4 5c-4 4-10 5-15 3-21-8-37-24-45-45-2-5-1-11 3-15z" style={mid} />
      <path d="M38 30c4-3 9-2 11 2l6 11c2 4 1 8-2 10l-5 4c4 9 11 16 20 20l4-5c2-3 6-4 10-2l11 6c4 2 5 7 2 11l-4 5c-4 4-10 5-15 3-21-8-37-24-45-45-2-5-1-11 3-15z" style={line} />
      <g className="art-pulse"><path d="M74 26a22 22 0 0 1 20 20" style={line} /><path d="M74 14a34 34 0 0 1 32 32" style={line} /></g>
      <circle cx="98" cy="96" r="7" style={strong} className="art-blink" />
      <path d="M14 104h8l4-8 5 14 5-10 4 4h10" style={line} />
    </>
  ),
  // Email & Texts: a letter, a chat bubble with a message on it, and a paper plane.
  mail: (
    <>
      <rect x="10" y="36" width="70" height="50" rx="6" style={soft} />
      <rect x="10" y="36" width="70" height="50" rx="6" style={line} />
      <path d="M12 40l33 24 33-24" style={line} />
      <path d="M66 70h40a6 6 0 0 1 6 6v18a6 6 0 0 1-6 6H84l-10 8v-8h-8a6 6 0 0 1-6-6V76a6 6 0 0 1 6-6z" style={paper} />
      <path d="M66 70h40a6 6 0 0 1 6 6v18a6 6 0 0 1-6 6H84l-10 8v-8h-8a6 6 0 0 1-6-6V76a6 6 0 0 1 6-6z" style={line} />
      {[76, 86, 96].map((x, i) => <circle key={x} cx={x} cy="85" r="3" style={{ ...strong, animationDelay: `${i * 160}ms` }} className="art-dot" />)}
      <g className="art-float"><path d="M78 18l30-6-12 28-6-10z" style={mid} /><path d="M78 18l30-6-12 28-6-10zM90 30l18-18" style={line} /></g>
    </>
  ),
  // Pay & Time: a wallet, coins stacked, and a clock.
  pay: (
    <>
      <path d="M14 44h64a8 8 0 0 1 8 8v40a8 8 0 0 1-8 8H22a8 8 0 0 1-8-8z" style={soft} />
      <path d="M14 44h64a8 8 0 0 1 8 8v40a8 8 0 0 1-8 8H22a8 8 0 0 1-8-8zM14 44l46-18 8 18" style={line} />
      <rect x="62" y="62" width="26" height="18" rx="5" style={paper} />
      <rect x="62" y="62" width="26" height="18" rx="5" style={line} />
      <circle cx="72" cy="71" r="3" style={strong} />
      <g className="art-float">
        {[0, 1, 2].map((i) => <ellipse key={i} cx="30" cy={36 - i * 7} rx="12" ry="4" style={i === 2 ? strong : mid} />)}
      </g>
      <circle cx="98" cy="30" r="16" style={paper} />
      <circle cx="98" cy="30" r="16" style={line} />
      <path d="M98 21v9l6 4" style={line} className="art-hand" />
    </>
  ),
  // Leads & Lists: a list of names, each tagged, and a funnel they come through.
  list: (
    <>
      <rect x="10" y="14" width="64" height="92" rx="8" style={soft} />
      <rect x="10" y="14" width="64" height="92" rx="8" style={line} />
      {[30, 50, 70, 90].map((y, i) => (
        <g key={y}>
          <circle cx="24" cy={y} r="5" style={i === 1 ? strong : mid} />
          <path d={`M34 ${y}h${28 - (i % 2) * 8}`} style={line} />
        </g>
      ))}
      <path d="M82 40h30l-11 16v18l-8 6V56z" style={mid} />
      <path d="M82 40h30l-11 16v18l-8 6V56z" style={line} />
      <g className="art-drop">{[88, 97, 106].map((x) => <circle key={x} cx={x} cy="30" r="3" style={strong} />)}</g>
      <path d="M97 88v14M90 96l7 7 7-7" style={line} />
    </>
  ),
  // Deleted Records: a bin, and an arrow bringing a page back out of it.
  trash: (
    <>
      <path d="M26 46h52l-6 58H32z" style={soft} />
      <path d="M26 46h52l-6 58H32zM20 46h64M42 46v-8h20v8M42 60v32M52 60v32M62 60v32" style={line} />
      <g className="art-float">
        <rect x="70" y="14" width="34" height="42" rx="4" style={paper} />
        <rect x="70" y="14" width="34" height="42" rx="4" style={line} />
        <path d="M78 26h18M78 34h18M78 42h10" style={line} />
      </g>
      <path d="M96 96c10-8 12-22 4-32" style={line} />
      <path d="M92 66l8-3 2 9" style={line} />
    </>
  ),
};

export default function SettingsArt({ name, className }) {
  return (
    <svg viewBox="0 0 120 120" className={className} aria-hidden data-settings-art={name}>
      {SCENES[name] ?? SCENES.building}
    </svg>
  );
}
