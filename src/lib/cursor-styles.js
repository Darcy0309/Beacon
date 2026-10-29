/**
 * Cursor styles (Oct 2026: the client's sheet of twenty, chosen in
 * Appearance; the computer's own cursor unless someone picks one). Each is
 * the computer's own cursor, as an image, so it moves exactly as fast as the
 * system's pointer: one at rest, one over something to click (larger, with a
 * glow) and one while pressed (a ring round it). What an image can't do (the
 * current round the Electric Gem, hearts, stars, embers, snow, sparkles, a
 * click's rings) CursorFollower draws on the page over it. Pure: shared by
 * both, and by Appearance's previews.
 *
 * Drawn about the size of a computer's own cursor (about 30px tall at
 * Normal), and scaled by the size chosen in Appearance (CURSOR_SIZES).
 */

export const CURSOR_SIZES = [["small", "Small", 0.8], ["normal", "Normal", 1], ["large", "Large", 1.3]];
const sizeOf = (key) => CURSOR_SIZES.find(([k]) => k === key)?.[2] ?? 1;
/** How much larger a cursor is over something to click (its tip staying put). */
export const HOVER_SCALE = 1.1;

// ---------------------------------------------------------------------------
// Shapes, in drawing units, the tip (the point that clicks) at TIP.

export const TIP = [3, 2];
const CLASSIC = "M3 2 L3 33 L10.5 26.5 L15.5 38 L20.5 35.8 L15.6 24.6 L25.5 24.6 Z";
// The gem styles' arrowhead: two feet below and a wing to the right, a large stone set in its middle.
const GP = { wing: [38, 31], notchR: [26, 31], tail: [32, 47], notch: [21, 36], foot: [12, 45] };
/** The gem arrowhead's outline, corner by corner: the Electric Gem's current runs along the outside of it. */
export const OUTLINE = [TIP, GP.wing, GP.notchR, GP.tail, GP.notch, GP.foot];
const GEM_ARROW = `M${OUTLINE.map((p) => p.join(",")).join(" L")} Z`;
export const GEM = [16.5, 24.5];
export const BEZEL = 8.2;
const STONE = 6.9;
export const at = (r, a, c = GEM) => [c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)];
export const pt = ([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`;
const LEAF = "M3 2 C 18 3, 33 15, 30 32 C 16 35, 4 21, 3 2 Z";
// The classic cursor, pixel by pixel: X its edge, o its inside.
const PIXELS = ["X", "XX", "XoX", "XooX", "XoooX", "XooooX", "XoooooX", "XooooooX", "XoooooooX", "XooooooooX", "XoooooXXXXX", "XooXooX", "XoX XooX", "XX  XooX", "X    XooX", "     XooX", "      XX"];

/** Where each shape's ring and effects are centred, how far round, and its drawing's box [x, y, width, height]. */
const SHAPES = {
  classic: { center: [12.5, 19], ring: 16, box: [-5, -5, 36, 48], height: 36 },
  gem: { center: GEM, ring: 22, box: [-6, -4, 50, 56], height: 45 },
  leaf: { center: [16, 18], ring: 18, box: [-5, -5, 42, 46], height: 34 },
  // The wand clicks where its star is.
  wand: { center: [9, 9], ring: 10, box: [-4, -4, 44, 48], height: 38, tip: [5, 4] },
  pixel: { center: [10, 18], ring: 15, box: [-5, -5, 34, 46], height: 34 },
};
// About a computer's own cursor at Normal: this many pixels tall.
const NORMAL_HEIGHT = 30;

// ---------------------------------------------------------------------------
// The twenty, as on the client's sheet. `effect`: what CursorFollower draws over it, over something to click.

const gold = ["#fff4c4", "#e2b553", "#8f6a2e"];
const STYLES = [
  { id: "standard", label: "System default" },
  { id: "large-classic", label: "Large Classic", shape: "classic", size: 1.25, fill: ["#ffffff"], stroke: "#111827", hoverFill: ["#bae6fd", "#3b82f6"], glow: "#60a5fa" },
  { id: "modern-blue", label: "Modern Blue", shape: "classic", fill: ["#e0f2fe", "#60a5fa", "#2563eb"], stroke: "#1e3a8a", glow: "#3b82f6" },
  { id: "neon-purple", label: "Neon Purple", shape: "classic", outline: true, fill: ["#1e0b2e"], stroke: "#e879f9", glow: "#c026d3", restGlow: true },
  { id: "neon-green", label: "Neon Green", shape: "classic", outline: true, fill: ["#052e16"], stroke: "#4ade80", glow: "#22c55e", restGlow: true },
  { id: "gem-crystal", label: "Gem Crystal", shape: "gem", crystal: ["#2fae98", "#0f5a52", "#073531"], stone: ["#b6ffe9", "#2fe0b0", "#0f9c78", "#065343"], glow: "#2fe0b0", effect: "sparkles" },
  { id: "electric-gem", label: "Electric Gem", shape: "gem", crystal: ["#2fae98", "#0f5a52", "#073531"], stone: ["#b6ffe9", "#2fe0b0", "#0f9c78", "#065343"], glow: "#2fe0b0", effect: "electric" },
  { id: "ruby-crystal", label: "Ruby Crystal", shape: "gem", crystal: ["#e0505a", "#8b1520", "#4a0810"], stone: ["#ffd0d4", "#ff4d5e", "#b3121f", "#5c0610"], glow: "#ff4d5e", effect: "sparkles" },
  { id: "sapphire-crystal", label: "Sapphire Crystal", shape: "gem", crystal: ["#4f86e8", "#1d3f8f", "#0b1d4a"], stone: ["#d4e4ff", "#4d8bff", "#1d4fc4", "#0a2466"], glow: "#4d8bff", effect: "sparkles" },
  { id: "golden-luxury", label: "Golden Luxury", shape: "classic", fill: gold, stroke: "#6b4a14", glow: "#fbbf24", effect: "sparkles" },
  { id: "minimal-outline", label: "Minimal Outline", shape: "classic", outline: true, fill: ["none"], stroke: "#ffffff", edge: "#111827", glow: "#e2e8f0" },
  { id: "gradient-modern", label: "Gradient Modern", shape: "classic", fill: ["#f5d0fe", "#a855f7", "#4f46e5"], stroke: "#ffffff", glow: "#a855f7" },
  { id: "soft-rounded", label: "Soft Rounded", shape: "classic", rounded: true, fill: ["#ffffff", "#c7d2fe"], stroke: "#a5b4fc", glow: "#818cf8" },
  { id: "pixel-retro", label: "Pixel Retro", shape: "pixel", fill: ["#ffffff"], stroke: "#000000", hoverFill: ["#3b82f6"], glow: "#3b82f6" },
  { id: "heart", label: "Heart Cursor", shape: "classic", fill: ["#fce7f3", "#f472b6", "#db2777"], stroke: "#9d174d", glow: "#f472b6", badge: "heart", effect: "hearts" },
  { id: "star", label: "Star Cursor", shape: "classic", fill: gold, stroke: "#7c5512", glow: "#fbbf24", badge: "star", effect: "stars" },
  { id: "leaf", label: "Leaf Cursor", shape: "leaf", fill: ["#d9f99d", "#4ade80", "#15803d"], stroke: "#14532d", glow: "#4ade80", effect: "sparkles" },
  { id: "flame", label: "Flame Cursor", shape: "classic", fill: ["#fef08a", "#fb923c", "#dc2626"], stroke: "#7c2d12", glow: "#f97316", flames: true, effect: "embers" },
  { id: "ice", label: "Ice Cursor", shape: "classic", fill: ["#f0f9ff", "#7dd3fc", "#0369a1"], stroke: "#e0f2fe", glow: "#38bdf8", facets: true, effect: "snow" },
  { id: "magic-wand", label: "Magic Wand", shape: "wand", fill: ["#fdf4ff", "#e879f9", "#a21caf"], stroke: "#581c87", glow: "#c084fc", effect: "stars" },
];
export const CURSOR_STYLES = STYLES.map(({ id, label }) => [id, label]);
const BY_ID = new Map(STYLES.map((s) => [s.id, s]));
export const isCursorStyle = (id) => BY_ID.has(id);

/** What CursorFollower needs of a style: its effect, colour, and where (in its drawing) to put them. */
export function cursorStyle(id) {
  const s = BY_ID.get(id);
  if (!s || id === "standard") return null;
  const shape = SHAPES[s.shape];
  return { id, effect: s.effect ?? null, glow: s.glow, center: shape.center, ring: shape.ring, box: shape.box, tip: shape.tip ?? TIP };
}
/** A style's scale (drawing units to pixels) at a size, at rest. */
export const cursorScale = (id, size = "normal") => (BY_ID.get(id)?.shape ? unitScale(BY_ID.get(id), size) : 1);

const unitScale = (s, size = "normal") => (NORMAL_HEIGHT / SHAPES[s.shape].height) * (s.size ?? 1) * sizeOf(size);

// ---------------------------------------------------------------------------
// Drawing.

const grad = (id, colors, x2 = 1, y2 = 1) => (colors.length === 1 ? "" : `<linearGradient id="${id}" x1="0" y1="0" x2="${x2}" y2="${y2}">${colors.map((c, i) => `<stop offset="${(i / (colors.length - 1)).toFixed(2)}" stop-color="${c}"/>`).join("")}</linearGradient>`);
const paint = (id, colors) => (colors.length === 1 ? colors[0] : `url(#${id})`);
const star = ([cx, cy], r) => Array.from({ length: 10 }, (_, i) => {
  const a = -Math.PI / 2 + (Math.PI / 5) * i;
  const rr = i % 2 ? r * 0.45 : r;
  return `${(cx + rr * Math.cos(a)).toFixed(2)},${(cy + rr * Math.sin(a)).toFixed(2)}`;
}).join(" ");
const heart = ([cx, cy], r) => `M${cx} ${cy + r * 0.9} C ${cx - r * 1.6} ${cy - r * 0.1}, ${cx - r * 0.7} ${cy - r * 1.3}, ${cx} ${cy - r * 0.35} C ${cx + r * 0.7} ${cy - r * 1.3}, ${cx + r * 1.6} ${cy - r * 0.1}, ${cx} ${cy + r * 0.9} Z`;

/** The shape itself, painted: the arrow (or leaf, wand, pixels, gem arrowhead) of a style, at rest or over something. */
function body(s, hover) {
  // The gem styles are painted in their own colours (crystal, stone), not a fill.
  const fill = (hover && s.hoverFill ? s.hoverFill : s.fill) ?? ["none"];
  const defs = grad("f", fill);
  const f = paint("f", fill);
  if (s.shape === "gem") {
    const TABLE = Array.from({ length: 8 }, (_, i) => at(3.1, (Math.PI / 4) * i + Math.PI / 8));
    const STAR = Array.from({ length: 8 }, (_, i) => at(5.1, (Math.PI / 4) * i));
    const GIRDLE = Array.from({ length: 16 }, (_, i) => at(STONE, (Math.PI / 8) * i));
    const facets = [
      ...TABLE.map((p, i) => `M${pt(p)} L${pt(STAR[i])} L${pt(TABLE[(i + 7) % 8])}`),
      ...STAR.map((p, i) => `M${pt(p)} L${pt(GIRDLE[(2 * i + 15) % 16])} M${pt(p)} L${pt(GIRDLE[(2 * i + 1) % 16])}`),
    ].join(" ");
    const crystal = [`M${TIP} L${pt(at(BEZEL, -2.2))}`, `M${GP.wing} L${pt(at(BEZEL, -0.25))}`, `M${GP.foot} L${pt(at(BEZEL, 1.95))}`,
      `M${GP.tail} L${pt(at(BEZEL, 0.95))}`, `M${GP.notchR} L${pt(at(BEZEL, 0.35))}`, `M${GP.notch} L${pt(at(BEZEL, 1.35))}`].join(" ");
    const [l, m, d, deep] = s.stone;
    return {
      defs: grad("g", gold) + grad("c", s.crystal)
        + `<radialGradient id="e" cx=".38" cy=".32" r=".75"><stop offset="0" stop-color="${l}"/><stop offset=".35" stop-color="${m}"/><stop offset=".75" stop-color="${d}"/><stop offset="1" stop-color="${deep}"/></radialGradient>`,
      svg: `<path d="${GEM_ARROW}" fill="url(#c)" fill-opacity=".96"/>`
        + `<path d="${crystal}" fill="none" stroke="#fff" stroke-opacity=".3" stroke-width=".5"/>`
        + `<path d="${GEM_ARROW}" fill="none" stroke="url(#g)" stroke-width="1.7" stroke-linejoin="round"/>`
        + `<circle cx="${GEM[0]}" cy="${GEM[1]}" r="${BEZEL}" fill="url(#g)" stroke="#5a4318" stroke-width=".5"/>`
        + `<circle cx="${GEM[0]}" cy="${GEM[1]}" r="${STONE}" fill="url(#e)"/>`
        + `<path d="${facets}" fill="none" stroke="#fff" stroke-opacity=".45" stroke-width=".35"/>`
        + `<ellipse cx="${GEM[0] - 2.4}" cy="${GEM[1] - 2.8}" rx="1.9" ry="1" transform="rotate(-35 ${GEM[0] - 2.4} ${GEM[1] - 2.8})" fill="#fff" fill-opacity=".85"/>`,
    };
  }
  if (s.shape === "pixel") {
    const rects = PIXELS.flatMap((row, y) => [...row].map((ch, x) => (ch === " " ? "" : `<rect x="${3 + x * 2}" y="${2 + y * 2}" width="2" height="2" fill="${ch === "X" ? s.stroke : f}"/>`)));
    return { defs, svg: `<g shape-rendering="crispEdges">${rects.join("")}</g>` };
  }
  if (s.shape === "leaf") {
    return {
      defs,
      svg: `<path d="M27 31 Q 31 36, 34 40" fill="none" stroke="${s.stroke}" stroke-width="1.6" stroke-linecap="round"/>`
        + `<path d="${LEAF}" fill="${f}" stroke="${s.stroke}" stroke-width="1.1" stroke-linejoin="round"/>`
        + `<path d="M4 3 Q 17 15, 28 31" fill="none" stroke="#f7fee7" stroke-opacity=".75" stroke-width=".8"/>`
        + `<path d="M10 11 L 15 8 M14 17 L 21 13 M19 22 L 26 19 M9 15 L 12 20 M14 21 L 17 26" fill="none" stroke="#f7fee7" stroke-opacity=".5" stroke-width=".6"/>`,
    };
  }
  if (s.shape === "wand") {
    return {
      defs: defs + grad("w", ["#fbcfe8", "#a855f7", "#4c1d95"], 1, 1),
      svg: `<path d="M13 13 L 36 40" stroke="${s.stroke}" stroke-width="4.4" stroke-linecap="round"/>`
        + `<path d="M13 13 L 36 40" stroke="url(#w)" stroke-width="2.8" stroke-linecap="round"/>`
        + `<path d="M31 34 L 36 40" stroke="#fde68a" stroke-width="2.8" stroke-linecap="round"/>`
        + `<polygon points="${star([9, 9], 8)}" fill="${f}" stroke="${s.stroke}" stroke-width="1" stroke-linejoin="round"/>`
        + `<circle cx="7" cy="7" r="1.4" fill="#fff" fill-opacity=".9"/>`,
    };
  }
  // The classic arrow: filled, an outline, rounded; with flames, facets of ice.
  const edge = s.edge ? `<path d="${CLASSIC}" fill="none" stroke="${s.edge}" stroke-width="3.2" stroke-linejoin="round"/>` : "";
  const flames = s.flames
    ? ["M3 9 Q -1 5, 2 0 Q 3 4, 5 5 Z", "M8 12 Q 7 6, 11 3 Q 10 8, 12 10 Z", "M13 17 Q 14 11, 18 9 Q 16 14, 17 16 Z", "M18 21 Q 21 16, 24 16 Q 21 19, 21 21 Z"]
      .map((d) => `<path d="${d}" fill="url(#f)" stroke="${s.stroke}" stroke-width=".5"/>`).join("")
    : "";
  const facets = s.facets ? `<path d="M3 2 L 13 24.6 L 10.5 26.5 M13 24.6 L 25.5 24.6 M13 24.6 L 3 33 M7 14 L 13 24.6" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width=".6"/>` : "";
  const shine = s.outline ? "" : `<path d="M4.3 5 L 4.3 22 L 9 12 Z" fill="#fff" fill-opacity=".35"/>`;
  return {
    defs,
    svg: flames + edge
      + `<path d="${CLASSIC}" fill="${s.outline && !hover ? (s.fill[0] === "none" ? "none" : s.fill[0]) : f}" fill-opacity="${s.outline ? (hover ? 0.55 : 0.4) : 1}"`
      + ` stroke="${s.rounded ? f : s.stroke}" stroke-width="${s.rounded ? 3.2 : s.outline ? 1.5 : 1.1}" stroke-linejoin="round"/>`
      + (s.rounded ? `<path d="${CLASSIC}" fill="none" stroke="${s.stroke}" stroke-opacity=".6" stroke-width=".6" stroke-linejoin="round" transform="translate(0 0)"/>` : "")
      + facets + shine,
  };
}

/**
 * A style's cursor as an SVG image: "rest", "hover" (larger, glowing) or
 * "press" (a ring round it, and the heart or star of those styles), at a size.
 * Returns { svg, hot: [x, y] } (the hotspot in the image's pixels: its tip).
 */
export function cursorSvg(id, state = "rest", size = "normal") {
  const s = BY_ID.get(id);
  if (!s || id === "standard") return null;
  const shape = SHAPES[s.shape];
  const hover = state !== "rest";
  const press = state === "press";
  const [bx, by, bw, bh] = shape.box;
  const scale = unitScale(s, size) * (hover ? HOVER_SCALE : 1);
  const w = Math.ceil(bw * scale);
  const h = Math.ceil(bh * scale);
  const glow = hover || s.restGlow;
  const { defs, svg } = body(s, hover);
  const ring = press ? `<circle cx="${shape.center[0]}" cy="${shape.center[1]}" r="${shape.ring}" fill="${s.glow}" fill-opacity=".14" stroke="${s.glow}" stroke-width="1.4"/>` : "";
  const badge = press && s.badge === "heart" ? `<path d="${heart(shape.center, 8)}" fill="${s.glow}" fill-opacity=".55"/>`
    : press && s.badge === "star" ? `<polygon points="${star(shape.center, 10)}" fill="${s.glow}" fill-opacity=".55"/>` : "";
  const filter = `<filter id="s" x="-40%" y="-40%" width="180%" height="180%">`
    + (glow ? `<feGaussianBlur in="SourceAlpha" stdDeviation="${hover ? 1.8 : 1.2}" result="b"/><feFlood flood-color="${s.glow}" flood-opacity="${hover ? 0.85 : 0.7}"/><feComposite in2="b" operator="in" result="glow"/>` : "")
    + `<feDropShadow in="SourceGraphic" dx="0" dy="1" stdDeviation=".8" flood-color="#000" flood-opacity=".45" result="d"/>`
    + `<feMerge>${glow ? '<feMergeNode in="glow"/>' : ""}<feMergeNode in="d"/></feMerge></filter>`;
  const out = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${bx} ${by} ${bw} ${bh}">`
    + `<defs>${defs}${filter}</defs>${ring}${badge}<g filter="url(#s)">${svg}</g></svg>`;
  const tip = shape.tip ?? TIP;
  return { svg: out, hot: [Math.round((tip[0] - bx) * scale), Math.round((tip[1] - by) * scale)] };
}

/** A style's image as a data: URL (Appearance's previews). */
export const cursorSrc = (id, state = "rest", size = "normal") => {
  const c = cursorSvg(id, state, size);
  return c ? `data:image/svg+xml,${encodeURIComponent(c.svg)}` : null;
};

/** A style's three cursors as CSS cursor values (the image, then its hotspot), or null for the computer's own. */
export function cursorImages(id, size = "normal") {
  if (!isCursorStyle(id) || id === "standard") return null;
  const value = (state) => {
    const c = cursorSvg(id, state, size);
    return `url("data:image/svg+xml,${encodeURIComponent(c.svg)}") ${c.hot[0]} ${c.hot[1]}`;
  };
  return { rest: value("rest"), hover: value("hover"), press: value("press") };
}
