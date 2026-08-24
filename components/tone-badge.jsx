import { cn } from "@/lib/utils";

const TONES = {
  emerald: "bg-emerald-500/10 text-emerald-600 ring-emerald-500/20",
  amber: "bg-amber-500/10 text-amber-600 ring-amber-500/20",
  rose: "bg-rose-500/10 text-rose-600 ring-rose-500/20",
  sky: "bg-sky-500/10 text-sky-600 ring-sky-500/20",
  violet: "bg-violet-500/10 text-violet-600 ring-violet-500/20",
  slate: "bg-slate-500/10 text-slate-500 ring-slate-500/20",
  primary: "bg-primary/10 text-primary ring-primary/25",
};

export default function ToneBadge({ tone = "slate", children, className }) {
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset", TONES[tone] || TONES.slate, className)}>
      {children}
    </span>
  );
}
