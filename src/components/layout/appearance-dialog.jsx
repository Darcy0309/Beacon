"use client";

import { useEffect, useRef, useState } from "react";
import { Image as ImageIcon, ImageUp, Monitor, Moon, RotateCcw, Sparkles, Sun, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DEFAULT_APPEARANCE, STYLES, DESKTOP_WALLPAPERS, PHOTO_WALLPAPERS, LIVE_WALLPAPERS, MAX_SHIFT, applyAppearance, fitImage, keepImage, readAppearance, readImage } from "@/lib/appearance";
import { cn } from "@/lib/utils";

const VEIL_KEY = "lighthouse.appearance.veil";
const THEMES = [["light", "Light", Sun], ["dark", "Dark", Moon], ["system", "System", Monitor]];

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
    setImage(null);
    if (a.wallpaper === "custom") change({ wallpaper: "classic" });
  };
  const change = (next) => {
    const merged = { ...a, ...next };
    setA(merged);
    applyAppearance(merged);
  };
  const dark = resolvedTheme === "dark";
  // The slider reads as brightness: 70% to 100% for light (dimmed), 100% to 130% for dark (lifted).
  const percent = dark ? Math.round(100 + a.dark * 100) : Math.round(100 - a.light * 100);
  const setPercent = (p) => change(dark ? { dark: (Number(p) - 100) / 100 } : { light: (100 - Number(p)) / 100 });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent veil={veil} side className="max-h-[90svh] max-w-lg overflow-y-auto" data-appearance-dialog>
        <DialogHeader>
          <DialogTitle>Appearance</DialogTitle>
          <DialogDescription>How Lighthouse looks for you. Saved on this computer; nobody else's changes.</DialogDescription>
        </DialogHeader>

        <label className="flex items-center gap-3 rounded-lg border border-[var(--panel-border)] px-3 py-2 text-xs text-muted-foreground">
          <span className="shrink-0 font-medium text-foreground">Background blur</span>
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
          <div role="radiogroup" aria-label="Style" className="grid grid-cols-2 gap-2">
            {STYLES.map(([k, label]) => (
              <button key={k} type="button" role="radio" aria-checked={a.style === k} onClick={() => change({ style: k })} data-style-pick={k}
                className={cn("rounded-lg border px-3 py-2 text-left transition-colors",
                  a.style === k ? "border-primary bg-primary/10" : "border-[var(--panel-border)] hover:border-primary/40")}>
                <span className={cn("block text-sm font-medium", a.style === k ? "text-primary" : "")}>{label}</span>
                <span className="block text-xs text-muted-foreground">{k === "modern" ? "Calm colours, soft cards, easy-to-read labels" : "The original look: neon edges, capital labels"}</span>
              </button>
            ))}
          </div>
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
          <Button type="button" variant="ghost" onClick={() => change({ ...DEFAULT_APPEARANCE })} disabled={a.style === "modern" && a.wallpaper === "classic" && !a.light && !a.dark}
            data-appearance-reset>
            <RotateCcw /> Back to the original
          </Button>
          <Button type="button" onClick={() => onOpenChange(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
