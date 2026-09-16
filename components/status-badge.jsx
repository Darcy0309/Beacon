import { cn } from "@/lib/utils";
import { STATUS } from "@/lib/data";

const ring = {
  appt: "border-emerald-400/40 bg-emerald-400/8 text-emerald-400",
  survey: "border-violet-400/40 bg-violet-400/8 text-violet-400",
  hot: "border-rose-400/40 bg-rose-400/8 text-rose-400",
  xdate: "border-cyan-400/40 bg-cyan-400/8 text-cyan-400",
  profile: "border-amber-400/45 bg-amber-400/8 text-amber-400",
  new: "border-slate-400/30 bg-slate-400/8 text-slate-400",
};
const dot = {
  appt: "bg-emerald-400",
  survey: "bg-violet-400",
  hot: "bg-rose-400",
  xdate: "bg-cyan-400",
  profile: "bg-amber-400",
  new: "bg-slate-400",
};

/** Accepts a status code ("hot") or a lead_statuses row ({ code, name }). */
export default function StatusBadge({ status }) {
  const code = typeof status === "string" ? status : status?.code;
  const label =
    (typeof status === "object" && status?.name) || STATUS[code]?.label || STATUS.new.label;
  const key = code in ring ? code : "new";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[0.66rem] font-semibold uppercase tracking-[0.1em]",
        ring[key]
      )}
    >
      <span className={cn("size-1.5 rounded-full", dot[key])} />
      {label}
    </span>
  );
}
