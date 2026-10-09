import Link from "@/components/shared/intent-link";
import { ListChecks } from "lucide-react";
import SectionHeader from "@/components/shared/section-header";
import FilterTable from "@/components/shared/filter-table";
import ToneBadge from "@/components/shared/tone-badge";
import { Card } from "@/components/ui/card";
import { TableCell, TableRow } from "@/components/ui/table";
import { formatIso } from "@/lib/dates";

const TYPE_TONE = { Lead: "cyan", "Hot Lead": "rose", Appointment: "violet", "Phone Appointment": "emerald" };

/**
 * Recent Leads & Appointments (row three of the manager's dashboard): the
 * ones the manager developed on a day (today by default), or over a week or
 * pay period — client, project, the name (company), what it became, and
 * when. Searchable by company, phone, contact, client or project.
 * `rows`: getDeveloped().
 */
export default function DevelopedCard({ rows, view, switcher, nav }) {
  const when = view.key === "day" ? "Developed" : "Date developed";
  return (
    <Card data-developed>
      <SectionHeader wrap label="Recent Leads & Appointments" icon={ListChecks} action={switcher} />
      <div className="flex items-center justify-between gap-2 px-5 pt-3">
        <span className="text-xs text-muted-foreground" data-developed-count>
          {rows.length} developed{view.key === "day" ? (view.anchor === view.today ? " today" : "") : ""}
        </span>
        {nav}
      </div>
      <FilterTable
        columns={["Client", "Project", "Company", "Type", when]}
        filters={[{ key: "type", label: "Type", kind: "chips" }]}
        placeholder="Search company, phone, contact…"
        empty={view.key === "day" && view.anchor === view.today ? "Nothing developed yet today." : "Nothing developed in these days."}
        rows={rows.map((r) => ({
          id: r.id,
          search: `${r.company} ${r.phone ?? ""} ${(r.phone ?? "").replace(/\D/g, "")} ${r.contact ?? ""} ${r.client} ${r.project} ${r.type} ${r.location}`,
          facets: { type: r.type },
          node: (
            <TableRow data-developed-row={r.id}>
              <TableCell className="font-medium">{r.client}</TableCell>
              <TableCell className="text-muted-foreground">
                {r.projectId ? <Link href={`/projects/${r.projectId}`} className="transition-colors hover:text-primary">{r.project}</Link> : r.project}
              </TableCell>
              <TableCell>
                {r.leadId ? <Link href={`/leads/${r.leadId}`} className="font-medium transition-colors hover:text-primary">{r.company}</Link> : r.company}
                <div className="text-xs text-muted-foreground">{[r.contact, r.phone].filter(Boolean).join(" · ") || r.location}</div>
              </TableCell>
              <TableCell><ToneBadge tone={TYPE_TONE[r.type] ?? "slate"}>{r.type}</ToneBadge></TableCell>
              <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground">
                {view.key === "day" ? r.time : `${formatIso(r.day, "short")}, ${r.time}`}
              </TableCell>
            </TableRow>
          ),
        }))}
      />
    </Card>
  );
}
