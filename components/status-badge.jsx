import { cn } from "@/lib/utils";
import { STATUS } from "@/lib/data";

const ring = {
  appt: "bg-emerald-500/10 text-emerald-600 ring-emerald-500/20",
  survey: "bg-violet-500/10 text-violet-600 ring-violet-500/20",
  hot: "bg-rose-500/10 text-rose-600 ring-rose-500/20",
  xdate: "bg-sky-500/10 text-sky-600 ring-sky-500/20",
  profile: "bg-amber-500/10 text-amber-600 ring-amber-500/20",
  new: "bg-slate-500/10 text-slate-500 ring-slate-500/20",
};
const dot = {
  appt: "bg-emerald-500",
  survey: "bg-violet-500",
  hot: "bg-rose-500",
  xdate: "bg-sky-500",
  profile: "bg-amber-500",
  new: "bg-slate-400",
};

export default function StatusBadge({ status }) {
  const s = STATUS[status] || STATUS.new;
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset", ring[status] || ring.new)}>
      <span className={cn("size-1.5 rounded-full", dot[status] || dot.new)} />
      {s.label}
    </span>
  );
}
