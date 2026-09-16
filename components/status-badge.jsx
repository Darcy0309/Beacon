import { cn } from "@/lib/utils";
import { STATUS } from "@/lib/constants";

const ring = {
  appt: "bg-emerald-500/10 text-emerald-700 ring-emerald-500/20 dark:text-emerald-400",
  survey: "bg-teal-500/10 text-teal-700 ring-teal-500/20 dark:text-teal-400",
  hot: "bg-rose-500/10 text-rose-700 ring-rose-500/20 dark:text-rose-400",
  xdate: "bg-sky-500/10 text-sky-700 ring-sky-500/20 dark:text-sky-400",
  profile: "bg-amber-500/10 text-amber-800 ring-amber-500/25 dark:text-amber-400",
  new: "bg-slate-500/10 text-slate-600 ring-slate-500/20 dark:text-slate-400",
};
const dot = {
  appt: "bg-emerald-500",
  survey: "bg-teal-500",
  hot: "bg-rose-500",
  xdate: "bg-sky-500",
  profile: "bg-amber-500",
  new: "bg-slate-400",
};

/**
 * Accepts either a status code ("hot") or a lead_statuses row ({ code, name }).
 */
export default function StatusBadge({ status }) {
  const code = typeof status === "string" ? status : status?.code;
  const label =
    (typeof status === "object" && status?.name) || STATUS[code]?.label || STATUS.new.label;
  const key = code in ring ? code : "new";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
        ring[key]
      )}
    >
      <span className={cn("size-1.5 rounded-full", dot[key])} />
      {label}
    </span>
  );
}
