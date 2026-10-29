"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Image as ImageIcon, ImageUp, Monitor, Moon, MousePointer2, Palette, RotateCcw, Sparkles, Sun, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CURSOR_SIZES, CURSOR_STYLES, cursorSrc } from "@/lib/cursor-styles";
import { DEFAULT_APPEARANCE, MAX_BLUR, STYLES, DESKTOP_WALLPAPERS, PHOTO_WALLPAPERS, LIVE_WALLPAPERS, MAX_SHIFT, TONES, applyAppearance, fitImage, keepImage, keepTint, pictureTint, readAppearance, readImage, toneFromColor } from "@/lib/appearance";
import { cn } from "@/lib/utils";

const VEIL_KEY = "lighthouse.appearance.veil";
const THEMES = [["light", "Light", Sun], ["dark", "Dark", Moon], ["system", "System", Monitor]];
// What "Default" looks like in each style (its own page, menu and accent), for its swatch.
const STYLE_DEFAULT_COLORS = {
  executive: { page: "#f5f3ee", menu: "#e2dccf", accent: "#1f3a8a" },
  modern: { page: "#f6f7f9", menu: "#ffffff", accent: "#2b6cb0" },
  classic: { page: "#f4f8fb", menu: "#fbfdfe", accent: "#0891b2" },
};
const STYLE_NOTES = {
  executive: "Warm and refined: soft cards, serif titles",
  modern: "Calm colours, soft cards, easy-to-read labels",
  classic: "The original look: neon edges, capital labels",
};

/**
 * Appearance (Sean, Oct 2026): the theme, a wallpaper behind the workspace (the
 * phone's, or Classic), and the brightness of the theme on show. Each change
 * shows at once and is kept on this computer.
 */
export default function AppearanceDialog({ open, onOpenChange }) {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const [a, setA] = useState(DEFAULT_APPEARANCE);
  const [image, setImage] = useState(null);
  const [fitting, setFitting] = useState(false);
  // How much the page behind this window is dimmed and blurred: clear to begin with, so every
  // change shows on the page as it is made (Sean, Oct 2026). Kept on this computer.
  const [veil, setVeilState] = useState(0);
  useEffect(() => {
    try {
      setVeilState(Math.min(1, Math.max(0, Number(localStorage.getItem(VEIL_KEY) ?? 0) || 0)));
    } catch {
      // Clear, then.
    }
  }, []);
  const setVeil = (v) => {
    setVeilState(v);
    try {
      localStorage.setItem(VEIL_KEY, String(v));
    } catch {
      // For this visit only.
    }
  };
  const fileRef = useRef(null);
  useEffect(() => {
    if (!open) return;
    setA(readAppearance());
    setImage(readImage());
  }, [open]);
  // A picture of their own: made fit for a background, kept on this computer, and put up.
  const upload = async (file) => {
    if (!file) return;
    setFitting(true);
    try {
      const fitted = await fitImage(file);
      if (!keepImage(fitted)) {
        toast.error("That picture is too big to keep in this browser. Try a smaller one.");
        return;
      }
      // The loading line takes the picture's own colours.
      keepTint(await pictureTint(fitted));
      setImage(fitted);
      change({ wallpaper: "custom" });
      toast.success("Your picture is up");
    } catch (err) {
      toast.error(err?.message ?? "That picture could not be used.");
    } finally {
      setFitting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };
  const removeImage = () => {
    keepImage(null);
    keepTint(null);
    setImage(null);
    if (a.wallpaper === "custom") change({ wallpaper: "classic" });
  };
  const change = (next) => {
    const merged = { ...a, ...next };
    setA(merged);
    // Said once: a browser that keeps nothing (private browsing, storage off) shows it for this visit only.
    if (!applyAppearance(merged)) toast.warning("This browser won't keep your appearance", { id: "appearance-kept", description: "It's on for this visit only (private browsing, or site storage turned off)." });
  };
  const dark = resolvedTheme === "dark";
  const custom = a.tone === "custom" ? toneFromColor(a.toneColor) : null;
  // The slider reads as brightness: 70% to 100% for light (dimmed), 100% to 130% for dark (lifted).
  const percent = dark ? Math.round(100 + a.dark * 100) : Math.round(100 - a.light * 100);
  const setPercent = (p) => change(dark ? { dark: (Number(p) - 100) / 100 } : { light: (100 - Number(p)) / 100 });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent veil={veil} veilBlur={12} side className="max-h-[90svh] max-w-lg overflow-y-auto" data-appearance-dialog>
        <DialogHeader>
          <DialogTitle>Appearance</DialogTitle>
          <DialogDescription>How Lighthouse looks for you. Saved on this computer; nobody else's changes.</DialogDescription>
        </DialogHeader>

        <label className="flex items-center gap-3 rounded-lg border border-[var(--panel-border)] px-3 py-2 text-xs text-muted-foreground">
          <span className="shrink-0 font-medium text-foreground">Blur behind this window</span>
          <input type="range" min={0} max={100} step={5} value={Math.round(veil * 100)} onChange={(e) => setVeil(Number(e.target.value) / 100)}
            aria-label="How much the page behind this window is blurred" data-veil-slider className="min-w-0 flex-1 accent-[var(--primary)]" />
          <span className="w-9 shrink-0 text-right tabular-nums">{veil ? `${Math.round(veil * 100)}%` : "Clear"}</span>
        </label>

        <section className="space-y-2">
          <h3 className="eyebrow text-muted-foreground">Theme</h3>
          <div role="radiogroup" aria-label="Theme" className="grid grid-cols-3 gap-2">
            {THEMES.map(([k, label, Icon]) => (
              <button key={k} type="button" role="radio" aria-checked={theme === k} onClick={() => setTheme(k)} data-theme-pick={k}
                className={cn("flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                  theme === k ? "border-primary bg-primary/10 text-primary" : "border-[var(--panel-border)] text-muted-foreground hover:border-primary/40 hover:text-foreground")}>
                <Icon className="size-4" /> {label}
              </button>
            ))}
          </div>
        </section>

        <section className="space-y-2">
          <h3 className="eyebrow text-muted-foreground">Style</h3>
          <div role="radiogroup" aria-label="Style" className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {STYLES.map(([k, label]) => (
              <button key={k} type="button" role="radio" aria-checked={a.style === k} onClick={() => change({ style: k })} data-style-pick={k}
                className={cn("rounded-lg border px-3 py-2 text-left transition-colors",
                  a.style === k ? "border-primary bg-primary/10" : "border-[var(--panel-border)] hover:border-primary/40")}>
                <span className={cn("block text-sm font-medium", a.style === k ? "text-primary" : "")}>{label}</span>
                <span className="block text-xs text-muted-foreground">{STYLE_NOTES[k]}</span>
              </button>
            ))}
          </div>
        </section>

        {/* The page's colour: the background, the menu a shade deeper and a matching accent (Sean, Oct 2026). */}
        <section className="space-y-2" data-tones>
          <h3 className="eyebrow flex items-center gap-1.5 text-muted-foreground"><Palette className="size-3.5 text-primary" /> Colours</h3>
          <div role="radiogroup" aria-label="Colours" className="grid grid-cols-4 gap-3 sm:grid-cols-7">
            <ToneSwatch label="Default" on={!a.tone} onPick={() => change({ tone: null })} colors={STYLE_DEFAULT_COLORS[a.style] ?? STYLE_DEFAULT_COLORS.executive} k="default" />
            {TONES.map(([k, label, page, menu, accent]) => (
              <ToneSwatch key={k} k={k} label={label} on={a.tone === k} onPick={() => change({ tone: k, wallpaper: "classic" })} colors={{ page, menu, accent }} />
            ))}
            <label className="group flex cursor-pointer flex-col items-center gap-1.5 text-[0.7rem] font-medium" data-tone-pick="custom" title="Pick any colour">
              <span className={cn("relative flex h-11 w-full items-center justify-center overflow-hidden rounded-xl border transition-transform group-hover:scale-[1.04]",
                a.tone === "custom" ? "border-primary ring-2 ring-primary/50" : "border-[var(--panel-border)]")}
                style={a.tone === "custom" && custom ? { background: `linear-gradient(90deg, ${custom.menu} 0 30%, ${custom.page} 30%)` } : { background: "conic-gradient(from 90deg, #e88, #ec8, #8c8, #8ce, #a8e, #e88)" }}>
                {a.tone === "custom" && custom ? <span className="absolute bottom-1.5 right-1.5 size-3 rounded-full" style={{ background: custom.accent }} /> : null}
                <input type="color" value={a.toneColor ?? "#2f6b8a"} onChange={(e) => change({ tone: "custom", toneColor: e.target.value, wallpaper: "classic" })}
                  aria-label="Your own colour" className="absolute inset-0 cursor-pointer opacity-0" data-tone-color />
              </span>
              <span className={a.tone === "custom" ? "text-primary" : "text-muted-foreground"}>Custom</span>
            </label>
          </div>
          <p className="text-xs text-muted-foreground">The page, a deeper shade for the menu and a matching accent. In the dark theme only the accent changes.</p>
        </section>

        <section className="space-y-2">
          <h3 className="eyebrow text-muted-foreground">Wallpaper</h3>
          <div role="radiogroup" aria-label="Wallpaper" className="grid grid-cols-3 gap-3 sm:grid-cols-5">
            {DESKTOP_WALLPAPERS.map(([k, label]) => (
              <button key={k} type="button" role="radio" aria-checked={a.wallpaper === k} onClick={() => change({ wallpaper: k })} data-desktop-wallpaper={k}
                className="group flex flex-col items-center gap-1.5 text-[0.7rem] font-medium">
                <span data-wallpaper={k}
                  className={cn("wallpaper-swatch h-14 w-full rounded-xl border transition-transform group-hover:scale-[1.04] group-active:scale-95",
                    a.wallpaper === k ? "border-primary ring-2 ring-primary/50" : "border-[var(--panel-border)]")} />
                <span className={a.wallpaper === k ? "text-primary" : "text-muted-foreground"}>{label}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="space-y-2">
          <h3 className="eyebrow flex items-center gap-1.5 text-muted-foreground"><ImageIcon className="size-3.5 text-primary" /> Photos</h3>
          <div role="radiogroup" aria-label="Photo wallpaper" className="grid grid-cols-3 gap-3 sm:grid-cols-5">
            {PHOTO_WALLPAPERS.map(([k, label]) => (
              <button key={k} type="button" role="radio" aria-checked={a.wallpaper === k} onClick={() => change({ wallpaper: k })} data-desktop-wallpaper={k}
                className="group flex flex-col items-center gap-1.5 text-[0.7rem] font-medium">
                <span data-wallpaper={k}
                  className={cn("wallpaper-swatch h-14 w-full rounded-xl border transition-transform group-hover:scale-[1.04] group-active:scale-95",
                    a.wallpaper === k ? "border-primary ring-2 ring-primary/50" : "border-[var(--panel-border)]")} />
                <span className={cn("truncate", a.wallpaper === k ? "text-primary" : "text-muted-foreground")}>{label}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="space-y-2">
          <h3 className="eyebrow flex items-center gap-1.5 text-muted-foreground"><Sparkles className="size-3.5 text-primary" /> Live</h3>
          <div role="radiogroup" aria-label="Live wallpaper" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {LIVE_WALLPAPERS.map(([k, label]) => (
              <button key={k} type="button" role="radio" aria-checked={a.wallpaper === k} onClick={() => change({ wallpaper: k })} data-desktop-wallpaper={k}
                className="group flex flex-col items-center gap-1.5 text-[0.7rem] font-medium">
                <span data-wallpaper={k}
                  className={cn("wallpaper-swatch h-14 w-full rounded-xl border transition-transform group-hover:scale-[1.04] group-active:scale-95",
                    a.wallpaper === k ? "border-primary ring-2 ring-primary/50" : "border-[var(--panel-border)]")} />
                <span className={a.wallpaper === k ? "text-primary" : "text-muted-foreground"}>{label}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="space-y-2">
          <h3 className="eyebrow text-muted-foreground">Your own picture</h3>
          <div className="flex items-center gap-3">
            {image ? (
              <button type="button" role="radio" aria-checked={a.wallpaper === "custom"} onClick={() => change({ wallpaper: "custom" })} data-desktop-wallpaper="custom"
                className="group shrink-0" title="Use your picture">
                <span data-wallpaper="custom" style={{ "--wp-image-swatch": `url("${image}")` }}
                  className={cn("wallpaper-swatch block h-14 w-24 rounded-xl border transition-transform group-hover:scale-[1.04]",
                    a.wallpaper === "custom" ? "border-primary ring-2 ring-primary/50" : "border-[var(--panel-border)]")} />
              </button>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={fitting} data-upload-wallpaper>
                <ImageUp /> {fitting ? "Preparing…" : image ? "Change picture" : "Upload a picture"}
              </Button>
              {image ? (
                <Button type="button" variant="ghost" size="sm" onClick={removeImage} data-remove-wallpaper>
                  <Trash2 /> Remove
                </Button>
              ) : null}
            </div>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" tabIndex={-1} aria-hidden
              onChange={(e) => upload(e.target.files?.[0])} data-wallpaper-file />
          </div>
          <p className="text-xs text-muted-foreground">JPG, PNG or WebP. It stays on this computer and is softened a little so text reads on it.</p>
        </section>

        {/* The cursor (Oct 2026: the client's twenty to pick from; the computer's own unless one is chosen), and its size. */}
        <section className="space-y-2" data-cursor-choice>
          <div className="flex items-center justify-between gap-3">
            <h3 className="eyebrow text-muted-foreground">Cursor</h3>
            <div role="radiogroup" aria-label="Cursor size" className="flex gap-1">
              {CURSOR_SIZES.map(([k, label]) => (
                <button key={k} type="button" role="radio" aria-checked={(a.cursorSize ?? "normal") === k} onClick={() => change({ cursorSize: k })}
                  disabled={(a.cursor ?? "standard") === "standard"} data-cursor-size-pick={k}
                  className={cn("rounded-md border px-2 py-0.5 text-xs font-medium transition-colors disabled:opacity-40",
                    (a.cursorSize ?? "normal") === k ? "border-primary bg-primary/10 text-primary" : "border-[var(--panel-border)] text-muted-foreground hover:border-primary/40")}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div role="radiogroup" aria-label="Cursor" className="grid grid-cols-4 gap-2 sm:grid-cols-5">
            {CURSOR_STYLES.map(([k, label]) => {
              const on = (a.cursor ?? "standard") === k;
              const src = cursorSrc(k);
              return (
                <button key={k} type="button" role="radio" aria-checked={on} onClick={() => change({ cursor: k })} data-cursor-pick={k} title={label}
                  className={cn("flex flex-col items-center gap-1 rounded-lg border px-1 py-2 text-center transition-colors",
                    on ? "border-primary bg-primary/10" : "border-[var(--panel-border)] hover:border-primary/40")}>
                  {/* Its look at rest; pointing at the tile shows its look over something to click. */}
                  <span className="flex h-10 w-10 items-center justify-center rounded-md bg-[#0d1520]">
                    {src ? <img src={src} alt="" className="max-h-9 max-w-9" /> : <MousePointer2 className="size-6 fill-white text-black" strokeWidth={1.5} />}
                  </span>
                  <span className={cn("text-[0.68rem] leading-tight", on ? "font-semibold text-primary" : "text-muted-foreground")}>{label}</span>
                </button>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">Point at a tile to see how the cursor looks over something you can click. It moves as fast as your computer's own, and stays on this computer.</p>
        </section>

        <section className="space-y-2" data-wallpaper-blur>
          <div className="flex items-center justify-between">
            <h3 className="eyebrow text-muted-foreground">Wallpaper blur</h3>
            <span className="text-sm font-semibold tabular-nums" data-wallpaper-blur-value>{a.blur ? `${a.blur} px` : "Sharp"}</span>
          </div>
          <input type="range" min={0} max={MAX_BLUR} step={1} value={a.blur ?? 0} onChange={(e) => change({ blur: Number(e.target.value) })}
            disabled={a.wallpaper === "classic"} data-wallpaper-blur-slider aria-label="How much the wallpaper is blurred"
            className="w-full accent-[var(--primary)] disabled:opacity-40" />
          <p className="text-xs text-muted-foreground">
            {a.wallpaper === "classic" ? "Choose a wallpaper or photo to blur it." : "Softens the wallpaper or photo behind the pages, so text stands out."}
          </p>
        </section>

        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="eyebrow text-muted-foreground">Brightness · {dark ? "dark" : "light"} theme</h3>
            <span className="text-sm font-semibold tabular-nums" data-brightness-value>{percent}%</span>
          </div>
          <input type="range" min={dark ? 100 : 100 - MAX_SHIFT * 100} max={dark ? 100 + MAX_SHIFT * 100 : 100} step={1}
            value={percent} onChange={(e) => setPercent(e.target.value)} data-brightness-slider
            aria-label={`Brightness of the ${dark ? "dark" : "light"} theme`} className="w-full accent-[var(--primary)]" />
          <div className="flex justify-between text-[0.7rem] text-muted-foreground">
            <span>{dark ? "As it comes" : "Dimmer"}</span>
            <span>{dark ? "Lighter" : "As it comes"}</span>
          </div>
          <p className="text-xs text-muted-foreground">
            {dark ? "Lifts the dark theme if it feels too dark." : "Tones the light theme down if it feels too bright."} Each theme keeps its own.
          </p>
        </section>

        <DialogFooter className="sm:justify-between">
          <Button type="button" variant="ghost" onClick={() => change({ ...DEFAULT_APPEARANCE })} disabled={a.style === DEFAULT_APPEARANCE.style && a.wallpaper === "classic" && !a.tone && !a.light && !a.dark && !a.blur && (a.cursor ?? "standard") === "standard" && (a.cursorSize ?? "normal") === "normal"}
            data-appearance-reset>
            <RotateCcw /> Back to the original
          </Button>
          <Button type="button" onClick={() => onOpenChange(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** One colour to pick: the page with the menu down its left and a dot of the accent (Default: the style's own). */
function ToneSwatch({ k, label, on, onPick, colors }) {
  return (
    <button type="button" role="radio" aria-checked={on} onClick={onPick} data-tone-pick={k}
      className="group flex flex-col items-center gap-1.5 text-[0.7rem] font-medium">
      <span className={cn("relative flex h-11 w-full items-center justify-center overflow-hidden rounded-xl border transition-transform group-hover:scale-[1.04] group-active:scale-95",
        on ? "border-primary ring-2 ring-primary/50" : "border-[var(--panel-border)]")}
        style={colors ? { background: `linear-gradient(90deg, ${colors.menu} 0 30%, ${colors.page} 30%)` } : { background: "var(--background)" }}>
        {colors ? <span className="absolute bottom-1.5 right-1.5 size-3 rounded-full" style={{ background: colors.accent }} /> : null}
        {on ? <Check className="relative size-4" style={{ color: colors?.accent ?? "var(--primary)" }} /> : null}
      </span>
      <span className={on ? "text-primary" : "text-muted-foreground"}>{label}</span>
    </button>
  );
}
