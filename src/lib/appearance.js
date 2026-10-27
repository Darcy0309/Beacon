/**
 * Appearance (Sean, Oct 2026): each person's wallpaper behind the workspace,
 * and how bright each theme is, kept on their computer. Applied to <html>
 * before the page draws (APPEARANCE_SCRIPT, in the root layout), so there is
 * no flash of the default look; changed from the theme button's Appearance.
 *
 *   style      "modern" (the default: calmer colours, soft cards, ordinary-case
 *              labels) or "classic" (the look as it was)
 *   wallpaper  "classic" (the workspace as it was), one of the phone's, a live
 *              one drawn on a canvas (LIVE_WALLPAPERS), or "custom": a picture
 *              they uploaded, kept apart under APPEARANCE_IMAGE_KEY
 *   light      how much the light theme is dimmed: 0 to 0.3 (100% to 70%)
 *   dark       how much the dark theme is lifted: 0 to 0.3 (100% to 130%)
 *   blur       how much the wallpaper itself is blurred, 0 to MAX_BLUR px
 */
export const APPEARANCE_KEY = "lighthouse.appearance";
export const DESKTOP_WALLPAPERS = [
  ["classic", "Classic"], ["mist", "Mist"], ["dawn", "Dawn"], ["lagoon", "Lagoon"], ["orchid", "Orchid"],
  ["meadow", "Meadow"], ["ember", "Ember"], ["nebula", "Nebula"], ["signature", "Signature"],
];
/** Photographs behind the workspace (public/wallpapers, free to use: Unsplash, by way of Picsum). */
export const PHOTO_WALLPAPERS = [
  ["photo-fjord", "Fjord"], ["photo-canyon", "Canyon"], ["photo-highlands", "Highlands"], ["photo-northern-lights", "Northern lights"],
  ["photo-alpine", "Alpine"], ["photo-valley", "Valley"], ["photo-coast", "Coast"], ["photo-city", "City"],
  ["photo-sunset", "Sunset"], ["photo-dunes", "Dunes"], ["photo-lake", "Lake"], ["photo-golden-field", "Golden field"],
];
export const LIVE_WALLPAPERS = [
  ["live-constellation", "Constellation"], ["live-waves", "Waves"], ["live-glow", "Glow"], ["live-starfield", "Starfield"],
];
export const APPEARANCE_IMAGE_KEY = "lighthouse.appearance.image";
const KNOWN = new Set([...DESKTOP_WALLPAPERS, ...PHOTO_WALLPAPERS, ...LIVE_WALLPAPERS].map(([k]) => k).concat("custom"));
export const MAX_SHIFT = 0.3;
export const MAX_BLUR = 24;
const clampBlur = (v) => Math.min(MAX_BLUR, Math.max(0, Math.round(Number(v) || 0)));
export const STYLES = [["executive", "Executive"], ["modern", "Modern"], ["classic", "Classic"]];
const STYLE_KEYS = new Set(STYLES.map(([k]) => k));
export const DEFAULT_APPEARANCE = { style: "executive", wallpaper: "classic", light: 0, dark: 0, blur: 0, tone: null, toneColor: null };
// Saved before Executive was the default (Sean, Oct 2026): a saved "modern" was then simply the default, so it moves to Executive once.
const APPEARANCE_VERSION = 2;

/**
 * The page's colours (Sean, Oct 2026): each a page background, the left menu a
 * shade deeper, and an accent for buttons, the chosen item and key figures (a
 * lighter one in the dark theme, where the page itself stays dark), and a second colour well
 * apart from the accent, for a chart's second line (leads in the accent, appointments in it).
 *   [key, label, page, menu, accent, accent in the dark theme, second, second in the dark theme]
 */
export const TONES = [
  ["paper", "Paper", "#f5f3ee", "#e2dccf", "#1f3a8a", "#8fa8ec", "#c8641e", "#f0a060"],
  ["sand", "Sand", "#efe6d6", "#ddcfb6", "#7a4b1e", "#e0b483", "#1d7a86", "#6cc4cf"],
  ["terracotta", "Terracotta", "#f3e1d7", "#e3c3b1", "#a8452a", "#f0a083", "#1d7a86", "#6cc4cf"],
  ["blush", "Blush", "#f6e4e6", "#e8c8cd", "#a33a55", "#f09ab0", "#1d7a86", "#6cc4cf"],
  ["lavender", "Lavender", "#ebe6f5", "#d6cdea", "#5b3fa8", "#b9a4f0", "#b7791f", "#e8b860"],
  ["periwinkle", "Periwinkle", "#e3e8f8", "#c9d2ef", "#2f4fb8", "#9fb3f5", "#c8641e", "#f0a060"],
  ["sky", "Sky", "#e1eef6", "#c3dbea", "#1d6a96", "#7fc0e8", "#c8641e", "#f0a060"],
  ["sage", "Sage", "#e6ece3", "#cdd8c8", "#3f6b45", "#9cc9a2", "#8e3b7a", "#d39ac6"],
  ["mint", "Mint", "#e0f1ec", "#c2e1d7", "#1d7a63", "#7ad7bc", "#c4513a", "#f0957f"],
  ["butter", "Butter", "#f6f0d8", "#e8ddb3", "#8a6a12", "#e6c766", "#3b4bb0", "#9aa6f0"],
  ["stone", "Stone", "#e9e9e7", "#d4d4d0", "#2c2f36", "#c9ccd3", "#c8641e", "#f0a060"],
  ["slate", "Slate", "#dfe3e9", "#c5ccd6", "#1e3a5f", "#93b4dc", "#c8641e", "#f0a060"],
];
const TONE_KEYS = new Set(TONES.map(([k]) => k).concat("custom"));
const HEX6 = /^#[0-9a-f]{6}$/i;

/**
 * A colour of their own made into a set like the others: a pale page in its
 * hue, the menu a shade deeper, a deep accent (and a light one for the dark
 * theme). Greys stay grey.
 */
export function toneFromColor(color) {
  if (!HEX6.test(color ?? "")) return null;
  const [h, s] = hsl(...[1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16)));
  const sat = s * 100;
  const tint = (sMax, l) => hex(h, Math.min(sat, sMax) / 100, l);
  return {
    page: tint(45, 0.935),
    menu: tint(32, 0.85),
    accent: hex(h, sat < 8 ? sat / 100 : Math.min(0.7, Math.max(0.45, s)), 0.32),
    accentDark: hex(h, sat < 8 ? sat / 100 : 0.65, 0.72),
    // The opposite hue (a warm orange for a grey), for a chart's second line.
    contrast: hex(sat < 8 ? 24 : (h + 180) % 360, 0.62, 0.44),
    contrastDark: hex(sat < 8 ? 28 : (h + 180) % 360, 0.7, 0.66),
  };
}

/** The four colours of the tone chosen, or null for the style's own. */
export function toneColors(a) {
  if (a?.tone === "custom") return toneFromColor(a.toneColor);
  const t = TONES.find(([k]) => k === a?.tone);
  return t ? { page: t[2], menu: t[3], accent: t[4], accentDark: t[5], contrast: t[6], contrastDark: t[7] } : null;
}

const clamp = (v) => Math.min(MAX_SHIFT, Math.max(0, Number(v) || 0));

export function readAppearance() {
  try {
    const a = JSON.parse(localStorage.getItem(APPEARANCE_KEY) ?? "{}") ?? {};
    const style = a.v !== APPEARANCE_VERSION && a.style === "modern" ? "executive" : STYLE_KEYS.has(a.style) ? a.style : "executive";
    return {
      style,
      wallpaper: KNOWN.has(a.wallpaper) && (a.wallpaper !== "custom" || readImage()) ? a.wallpaper : "classic",
      light: clamp(a.light),
      dark: clamp(a.dark),
      blur: clampBlur(a.blur),
      tone: TONE_KEYS.has(a.tone) && (a.tone !== "custom" || HEX6.test(a.toneColor ?? "")) ? a.tone : null,
      toneColor: HEX6.test(a.toneColor ?? "") ? a.toneColor.toLowerCase() : null,
    };
  } catch {
    return { ...DEFAULT_APPEARANCE };
  }
}

/** The uploaded picture (a data: URL), or null. */
export function readImage() {
  try {
    return localStorage.getItem(APPEARANCE_IMAGE_KEY) || null;
  } catch {
    return null;
  }
}

/** Keep an uploaded picture; false when the browser has no room for it. */
export function keepImage(dataUrl) {
  try {
    if (dataUrl) localStorage.setItem(APPEARANCE_IMAGE_KEY, dataUrl);
    else localStorage.removeItem(APPEARANCE_IMAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

/**
 * A picture chosen to upload, made fit for a background: no wider or taller
 * than a large screen, as a JPEG (a few hundred KB), so it is quick to show
 * and fits the browser's storage. Resolves to a data: URL.
 */
export function fitImage(file, max = 1920) {
  return new Promise((resolve, reject) => {
    if (!file || !/^image\//.test(file.type)) return reject(new Error("Choose a picture: JPG, PNG or WebP."));
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.82));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("That picture could not be opened. Try a JPG or PNG."));
    };
    img.src = url;
  });
}

/** The loading line's two colours for an uploaded picture ["#rrggbb", "#rrggbb"], kept beside it. */
export const APPEARANCE_TINT_KEY = "lighthouse.appearance.tint";
const HEX = /^#[0-9a-f]{6}$/;

export function readTint() {
  try {
    const t = JSON.parse(localStorage.getItem(APPEARANCE_TINT_KEY) ?? "null");
    return Array.isArray(t) && t.length === 2 && t.every((c) => HEX.test(c)) ? t : null;
  } catch {
    return null;
  }
}

export function keepTint(tint) {
  try {
    if (tint) localStorage.setItem(APPEARANCE_TINT_KEY, JSON.stringify(tint));
    else localStorage.removeItem(APPEARANCE_TINT_KEY);
  } catch {
    // Without it the line keeps the theme's colours.
  }
}

const hsl = (r, g, b) => {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  if (!d) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
};
const hex = (h, s, l) => {
  const k = (n) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  const f = (n) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))));
  return `#${[f(0), f(8), f(4)].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
};

/**
 * A picture's two strongest colours, made bright enough for the loading line:
 * the hue it has most of (counting colourful pixels more than greys), and the
 * next one well apart from it (or a neighbour of the first, for a picture of
 * one colour). Null for a picture with hardly any colour (it keeps the theme's).
 */
export function pictureTint(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = c.height = 40;
      const ctx = c.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, 40, 40);
      const px = ctx.getImageData(0, 0, 40, 40).data;
      const buckets = Array.from({ length: 12 }, () => ({ w: 0, s: 0, l: 0, x: 0, y: 0 }));
      let total = 0;
      for (let i = 0; i < px.length; i += 4) {
        const [h, s, l] = hsl(px[i], px[i + 1], px[i + 2]);
        if (s < 0.18 || l < 0.1 || l > 0.94) continue;
        const w = s * (1 - Math.abs(l - 0.5));
        const b = buckets[Math.floor(h / 30) % 12];
        // Hue is an angle: averaged as a direction, so reds either side of 0° agree.
        b.w += w; b.s += s * w; b.l += l * w;
        b.x += Math.cos((h * Math.PI) / 180) * w; b.y += Math.sin((h * Math.PI) / 180) * w;
        total += w;
      }
      if (total < 40) return resolve(null);
      const colour = (b) => {
        const h = ((Math.atan2(b.y, b.x) * 180) / Math.PI + 360) % 360;
        return { h, hex: hex(h, Math.max(0.7, b.s / b.w), Math.min(0.62, Math.max(0.5, b.l / b.w))) };
      };
      const ranked = buckets.map((b, i) => ({ ...b, i })).filter((b) => b.w > 0).sort((p, q) => q.w - p.w);
      const first = colour(ranked[0]);
      const apart = ranked.slice(1).find((b) => b.w > ranked[0].w * 0.12 && Math.min(Math.abs(b.i - ranked[0].i), 12 - Math.abs(b.i - ranked[0].i)) >= 2);
      resolve([first.hex, apart ? colour(apart).hex : hex((first.h + 35) % 360, 0.75, 0.58)]);
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** Put an appearance on the page, and keep it (best-effort: private browsing may not). False when it couldn't be kept. */
export function applyAppearance(a, { keep = true } = {}) {
  const d = document.documentElement;
  // Executive builds on Modern: Modern's rules, then its own (html[data-executive]).
  d.dataset.style = a.style === "classic" ? "classic" : "modern";
  if (a.style === "executive" || !STYLE_KEYS.has(a.style)) d.dataset.executive = "";
  else delete d.dataset.executive;
  // The colours: the page, the menu and the accent (TONES), as variables globals.css reads.
  const tone = toneColors(a);
  for (const [prop, key] of [["--tone-page", "page"], ["--tone-menu", "menu"], ["--tone-accent", "accent"], ["--tone-accent-dark", "accentDark"],
    ["--tone-contrast", "contrast"], ["--tone-contrast-dark", "contrastDark"]]) {
    if (tone) d.style.setProperty(prop, tone[key]);
    else d.style.removeProperty(prop);
  }
  if (tone) d.dataset.tone = a.tone;
  else delete d.dataset.tone;
  const image = a.wallpaper === "custom" ? readImage() : null;
  if (image) d.style.setProperty("--wp-image", `url("${image}")`);
  else d.style.removeProperty("--wp-image");
  // An uploaded picture's own colours for the loading line; the others are in globals.css.
  const tint = image ? readTint() : null;
  if (tint) {
    d.style.setProperty("--progress-a", tint[0]);
    d.style.setProperty("--progress-b", tint[1]);
  } else {
    d.style.removeProperty("--progress-a");
    d.style.removeProperty("--progress-b");
  }
  if (a.wallpaper && a.wallpaper !== "classic") d.dataset.wallpaper = a.wallpaper;
  else delete d.dataset.wallpaper;
  d.style.setProperty("--wp-blur", `${clampBlur(a.blur)}px`);
  d.style.setProperty("--wp-blur-scale", String(1 + clampBlur(a.blur) / 160));
  d.style.setProperty("--dim-light", String(clamp(a.light)));
  d.style.setProperty("--lift-dark", String(clamp(a.dark)));
  if (clamp(a.light) || clamp(a.dark)) d.dataset.brightness = "";
  else delete d.dataset.brightness;
  if (!keep) return true;
  try {
    localStorage.setItem(APPEARANCE_KEY, JSON.stringify({ v: APPEARANCE_VERSION, style: STYLE_KEYS.has(a.style) ? a.style : "executive", wallpaper: a.wallpaper,
      blur: clampBlur(a.blur), light: clamp(a.light), dark: clamp(a.dark), tone: tone ? a.tone : null, toneColor: HEX6.test(a.toneColor ?? "") ? a.toneColor : null,
      // A colour of their own, worked out, for the script that puts it on before the page draws.
      toneVars: tone && a.tone === "custom" ? [tone.page, tone.menu, tone.accent, tone.accentDark, tone.contrast, tone.contrastDark] : undefined }));
    return true;
  } catch {
    // Kept for this visit only.
    return false;
  }
}

/** The same, as a script run before the page draws: no flash of the default look. */
// Executive unless Modern (saved since it stopped being the default) or Classic was chosen; then the colours (TONES, or their own).
const TONE_SCRIPT_TABLE = JSON.stringify(Object.fromEntries(TONES.map(([k, , ...colors]) => [k, colors])));
export const APPEARANCE_SCRIPT = `var d=document.documentElement;d.dataset.style="modern";d.dataset.executive="";try{var a=JSON.parse(localStorage.getItem(${JSON.stringify(APPEARANCE_KEY)})||"{}")||{},c=function(v){v=Number(v)||0;return Math.min(${MAX_SHIFT},Math.max(0,v))};`
  + `if(a.style==="classic"){d.dataset.style="classic";delete d.dataset.executive;}else if(a.style==="modern"&&a.v===${APPEARANCE_VERSION})delete d.dataset.executive;`
  + `var T=${TONE_SCRIPT_TABLE},k=a.tone,tc=null;if(k==="custom"&&a.toneVars&&/^#[0-9a-f]{6}$/i.test(a.toneVars[0]))tc=a.toneVars;else if(typeof k==="string"&&T[k])tc=T[k];`
  + `if(tc){d.dataset.tone=k;["--tone-page","--tone-menu","--tone-accent","--tone-accent-dark","--tone-contrast","--tone-contrast-dark"].forEach(function(p,j){if(/^#[0-9a-f]{6}$/i.test(tc[j]))d.style.setProperty(p,tc[j]);});}`
  + `if(typeof a.wallpaper==="string"&&/^[a-z-]+$/.test(a.wallpaper)&&a.wallpaper!=="classic"){var i=a.wallpaper==="custom"?localStorage.getItem(${JSON.stringify("lighthouse.appearance.image")}):"";`
  + `if(a.wallpaper!=="custom"||i){d.dataset.wallpaper=a.wallpaper;if(i){d.style.setProperty("--wp-image",'url("'+i+'")');`
  + `var t=JSON.parse(localStorage.getItem(${JSON.stringify(APPEARANCE_TINT_KEY)})||"null");if(t&&/^#[0-9a-f]{6}$/.test(t[0])&&/^#[0-9a-f]{6}$/.test(t[1])){d.style.setProperty("--progress-a",t[0]);d.style.setProperty("--progress-b",t[1]);}}}}`
  + `var b=Math.min(${MAX_BLUR},Math.max(0,Math.round(Number(a.blur)||0)));d.style.setProperty("--wp-blur",b+"px");d.style.setProperty("--wp-blur-scale",String(1+b/160));`
  + `d.style.setProperty("--dim-light",String(c(a.light)));d.style.setProperty("--lift-dark",String(c(a.dark)));if(c(a.light)||c(a.dark))d.dataset.brightness="";}catch(e){}`;
