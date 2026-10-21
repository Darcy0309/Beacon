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
  ["photo-sunset", "Sunset"], ["photo-dunes", "Dunes"],
];
export const LIVE_WALLPAPERS = [
  ["live-constellation", "Constellation"], ["live-waves", "Waves"], ["live-glow", "Glow"], ["live-starfield", "Starfield"],
];
export const APPEARANCE_IMAGE_KEY = "lighthouse.appearance.image";
const KNOWN = new Set([...DESKTOP_WALLPAPERS, ...PHOTO_WALLPAPERS, ...LIVE_WALLPAPERS].map(([k]) => k).concat("custom"));
export const MAX_SHIFT = 0.3;
export const STYLES = [["modern", "Modern"], ["classic", "Classic"]];
export const DEFAULT_APPEARANCE = { style: "modern", wallpaper: "classic", light: 0, dark: 0 };

const clamp = (v) => Math.min(MAX_SHIFT, Math.max(0, Number(v) || 0));

export function readAppearance() {
  try {
    const a = JSON.parse(localStorage.getItem(APPEARANCE_KEY) ?? "{}") ?? {};
    return {
      style: a.style === "classic" ? "classic" : "modern",
      wallpaper: KNOWN.has(a.wallpaper) && (a.wallpaper !== "custom" || readImage()) ? a.wallpaper : "classic",
      light: clamp(a.light),
      dark: clamp(a.dark),
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

/** Put an appearance on the page, and keep it (best-effort: private browsing may not). */
export function applyAppearance(a, { keep = true } = {}) {
  const d = document.documentElement;
  d.dataset.style = a.style === "classic" ? "classic" : "modern";
  const image = a.wallpaper === "custom" ? readImage() : null;
  if (image) d.style.setProperty("--wp-image", `url("${image}")`);
  else d.style.removeProperty("--wp-image");
  if (a.wallpaper && a.wallpaper !== "classic") d.dataset.wallpaper = a.wallpaper;
  else delete d.dataset.wallpaper;
  d.style.setProperty("--dim-light", String(clamp(a.light)));
  d.style.setProperty("--lift-dark", String(clamp(a.dark)));
  if (clamp(a.light) || clamp(a.dark)) d.dataset.brightness = "";
  else delete d.dataset.brightness;
  if (!keep) return;
  try {
    localStorage.setItem(APPEARANCE_KEY, JSON.stringify({ style: a.style === "classic" ? "classic" : "modern", wallpaper: a.wallpaper, light: clamp(a.light), dark: clamp(a.dark) }));
  } catch {
    // Kept for this visit only.
  }
}

/** The same, as a script run before the page draws: no flash of the default look. */
export const APPEARANCE_SCRIPT = `var d=document.documentElement;d.dataset.style="modern";try{var a=JSON.parse(localStorage.getItem(${JSON.stringify(APPEARANCE_KEY)})||"{}")||{},c=function(v){v=Number(v)||0;return Math.min(${MAX_SHIFT},Math.max(0,v))};if(a.style==="classic")d.dataset.style="classic";`
  + `if(typeof a.wallpaper==="string"&&/^[a-z-]+$/.test(a.wallpaper)&&a.wallpaper!=="classic"){var i=a.wallpaper==="custom"?localStorage.getItem(${JSON.stringify("lighthouse.appearance.image")}):"";`
  + `if(a.wallpaper!=="custom"||i){d.dataset.wallpaper=a.wallpaper;if(i)d.style.setProperty("--wp-image",'url("'+i+'")');}}`
  + `d.style.setProperty("--dim-light",String(c(a.light)));d.style.setProperty("--lift-dark",String(c(a.dark)));if(c(a.light)||c(a.dark))d.dataset.brightness="";}catch(e){}`;
