import { pctLabel } from "@/lib/lead-stats";

/**
 * Under a Conversions tile's figure (names to leads): leads to
 * appointments, and the three counts both come from. `s`: shapeStats().
 */
export default function ConversionLines({ s }) {
  return (
    <div className="mt-2 space-y-1 text-xs" data-conversions>
      <div><strong className="tabular-nums">{pctLabel(s.apptRate)}</strong> <span className="text-muted-foreground">of leads became appointments</span></div>
      <div className="tabular-nums text-muted-foreground">
        {s.names.toLocaleString()} names · {s.developed.toLocaleString()} leads developed · {s.appointmentsSet.toLocaleString()} appointments
      </div>
    </div>
  );
}
