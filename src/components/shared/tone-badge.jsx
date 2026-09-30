import { cn } from "@/lib/utils";

// Outlined pill chips, each carrying its own accent hue.
const TONES = {
  emerald: "border-emerald-400/40 bg-emerald-400/8 text-emerald-400",
  amber: "border-amber-400/45 bg-amber-400/8 text-amber-400",
  rose: "border-rose-400/40 bg-rose-400/8 text-rose-400",
  sky: "border-sky-400/40 bg-sky-400/8 text-sky-400",
  cyan: "border-cyan-400/40 bg-cyan-400/8 text-cyan-400",
  violet: "border-violet-400/40 bg-violet-400/8 text-violet-400",
  magenta: "border-fuchsia-400/40 bg-fuchsia-400/8 text-fuchsia-400",
  slate: "border-slate-400/30 bg-slate-400/8 text-slate-400",
  primary: "border-primary/45 bg-primary/8 text-primary",
};

export default function ToneBadge({ tone = "slate", children, className }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[0.66rem] font-semibold uppercase tracking-[0.1em]",
        TONES[tone] || TONES.slate,
        className
      )}
    >
      {children}
    </span>
  );
}
