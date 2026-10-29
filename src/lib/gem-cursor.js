/**
 * The gem cursor's drawing (Oct 2026, to the client's design): a
 * gold-framed arrowhead of teal crystal with a large emerald set in it like
 * a button. It is the computer's own cursor, as an image (cursorImages()), so
 * it moves exactly as fast as the system's pointer; only what moves inside
 * it (the current crackling round the gem, the rings of a click) is drawn on
 * the page over it, by CursorFollower. Pure: shared by both.
 */

/** Where the arrow's tip is in the drawing: the point that clicks. */
export const TIP = [3, 2];
/** The gem's centre, and its bezel's and stone's radius. */
export const GEM = [16.5, 24.5];
export const BEZEL = 8.2;
const STONE = 6.9;
/** How much larger the cursor is over something to click (its tip staying put). */
export const HOVER_SCALE = 1.1;

const P = { wing: [38, 31], notchR: [26, 31], tail: [32, 47], notch: [21, 36], foot: [12, 45] };
const ARROW = `M${TIP} L${P.wing} L${P.notchR} L${P.tail} L${P.notch} L${P.foot} Z`;
export const at = (r, a) => [GEM[0] + r * Math.cos(a), GEM[1] + r * Math.sin(a)];
export const pt = ([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`;
// The crystal's facets: from the tip and the gem's edge out to the arrow's corners.
const CRYSTAL = [
  `M${TIP} L${pt(at(BEZEL, -2.2))}`, `M${P.wing} L${pt(at(BEZEL, -0.25))}`, `M${P.foot} L${pt(at(BEZEL, 1.95))}`,
  `M${P.tail} L${pt(at(BEZEL, 0.95))}`, `M${P.notchR} L${pt(at(BEZEL, 0.35))}`, `M${P.notch} L${pt(at(BEZEL, 1.35))}`,
].join(" ");
// The emerald, a round brilliant seen from above: an octagonal table, a star round it, and the girdle's facets.
const TABLE = Array.from({ length: 8 }, (_, i) => at(3.1, (Math.PI / 4) * i + Math.PI / 8));
const STAR = Array.from({ length: 8 }, (_, i) => at(5.1, (Math.PI / 4) * i));
const GIRDLE = Array.from({ length: 16 }, (_, i) => at(STONE, (Math.PI / 8) * i));
const FACETS = [
  ...TABLE.map((p, i) => `M${pt(p)} L${pt(STAR[i])} L${pt(TABLE[(i + 7) % 8])}`),
  ...STAR.map((p, i) => `M${pt(p)} L${pt(GIRDLE[(2 * i + 15) % 16])} M${pt(p)} L${pt(GIRDLE[(2 * i + 1) % 16])}`),
].join(" ");

/**
 * The cursor as an SVG image: "rest", "hover" (larger and brighter, glowing
 * teal) or "press" (the gem pushed in, lit up).
 */
export function gemCursorSvg(state = "rest") {
  const hover = state !== "rest";
  const press = state === "press";
  const scale = hover ? HOVER_SCALE : 1;
  const w = Math.ceil(46 * scale);
  const h = Math.ceil(52 * scale);
  const gem = press ? `translate(${GEM[0]} ${GEM[1] + 0.5}) scale(0.88) translate(${-GEM[0]} ${-GEM[1]})` : "";
  const glow = hover ? '<feGaussianBlur in="SourceAlpha" stdDeviation="2.2" result="g"/><feFlood flood-color="#2fe0b0" flood-opacity="0.75"/><feComposite in2="g" operator="in" result="glow"/>' : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w / scale} ${h / scale}">`
    + "<defs>"
    + '<linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fbf0c8"/><stop offset=".45" stop-color="#d9b56a"/><stop offset="1" stop-color="#8f6a2e"/></linearGradient>'
    + '<linearGradient id="c" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2fae98" stop-opacity=".96"/><stop offset=".55" stop-color="#0f5a52" stop-opacity=".96"/><stop offset="1" stop-color="#073531" stop-opacity=".96"/></linearGradient>'
    + `<radialGradient id="e" cx=".38" cy=".32" r=".75"><stop offset="0" stop-color="#b6ffe9"/><stop offset=".35" stop-color="${hover ? "#5ff5c8" : "#2fe0b0"}"/><stop offset=".75" stop-color="${hover ? "#16b48b" : "#0f9c78"}"/><stop offset="1" stop-color="#065343"/></radialGradient>`
    + `<filter id="s" x="-30%" y="-30%" width="160%" height="160%">${glow}<feDropShadow in="SourceGraphic" dx="0" dy="1.2" stdDeviation="0.9" flood-color="#000" flood-opacity=".5" result="d"/>`
    + `<feMerge>${hover ? '<feMergeNode in="glow"/>' : ""}<feMergeNode in="d"/></feMerge></filter>`
    + "</defs>"
    + '<g filter="url(#s)">'
    + `<path d="${ARROW}" fill="url(#c)"/>`
    + `<path d="${CRYSTAL}" fill="none" stroke="#beffee" stroke-opacity=".35" stroke-width=".5"/>`
    + `<path d="${ARROW}" fill="none" stroke="url(#g)" stroke-width="1.7" stroke-linejoin="round"/>`
    + `<g transform="${gem}">`
    + `<circle cx="${GEM[0]}" cy="${GEM[1]}" r="${BEZEL}" fill="url(#g)" stroke="#5a4318" stroke-width=".5"/>`
    + `<circle cx="${GEM[0]}" cy="${GEM[1]}" r="${STONE}" fill="url(#e)"/>`
    + `<path d="${FACETS}" fill="none" stroke="#dcfff5" stroke-opacity=".45" stroke-width=".35"/>`
    + `<ellipse cx="${GEM[0] - 2.4}" cy="${GEM[1] - 2.8}" rx="1.9" ry="1" transform="rotate(-35 ${GEM[0] - 2.4} ${GEM[1] - 2.8})" fill="#fff" fill-opacity=".85"/>`
    + "</g></g></svg>";
}

/** The three cursors as CSS cursor values (the image, then its hotspot: the tip). */
export function cursorImages() {
  const hot = (scale) => `${Math.round(TIP[0] * scale)} ${Math.round(TIP[1] * scale)}`;
  const url = (state) => `url("data:image/svg+xml,${encodeURIComponent(gemCursorSvg(state))}")`;
  return {
    rest: `${url("rest")} ${hot(1)}`,
    hover: `${url("hover")} ${hot(HOVER_SCALE)}`,
    press: `${url("press")} ${hot(HOVER_SCALE)}`,
  };
}
