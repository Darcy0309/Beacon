import ParamMulti from "@/components/shared/param-multi";
import ParamSelect from "@/components/shared/param-select";
import { MONTH_SHORT, PROJECT_TYPES } from "@/lib/pipeline";

const MONTH_OPTIONS = MONTH_SHORT.map((m, i) => ({ value: String(i + 1), label: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][i] }));

/**
 * X-Dates by Month's and the Pipeline Report's filters (Sean, Oct 2026), all
 * in the address: client, its Sales Rep, DB dev or appointment projects,
 * projects and managers (several of each, "All" at the top) and the renewal
 * months (several, as on Lead Explorer). A change starts the names' list over.
 *
 *   filters   readXdateFilters()
 *   options   { companies, projects: [{ id, name, company_id, type }], reps, managers }
 *   showClient   the client and Sales Rep pickers (not for a client's own view)
 */
export default function XdateFilterBar({ filters, options, showClient = true, showManagers = true }) {
  const clears = ["page", "month", "bucket"];
  const projects = options.projects.filter((p) => (!filters.companyId || p.company_id === filters.companyId) && (!filters.type || p.type === filters.type));
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-3 border-b border-[var(--panel-border)] px-5 py-3" data-xdate-filters>
      {showClient ? (
        <>
          <ParamSelect name="client" label="Client" value={filters.companyId ? String(filters.companyId) : ""} placeholder="All clients"
            clears={[...clears, "project"]} options={options.companies.map((c) => ({ value: String(c.id), label: c.name }))} />
          <ParamSelect name="rep" label="Sales Rep" value={filters.repId ? String(filters.repId) : ""} placeholder="All" clears={clears}
            options={(options.reps ?? []).map((r) => ({ value: String(r.id), label: r.name }))} />
        </>
      ) : null}
      <ParamSelect name="type" label="Type" value={filters.type ?? ""} placeholder="DB Dev & Appts" clears={[...clears, "project"]}
        options={PROJECT_TYPES.map(([value, label]) => ({ value, label }))} />
      <ParamMulti name="project" label="Project" values={filters.projectIds.map(String)} clears={clears}
        options={projects.map((p) => ({ value: String(p.id), label: p.name }))} />
      {showManagers ? (
        <ParamMulti name="managers" label="Manager" values={filters.userIds.map(String)} clears={clears} options={options.managers ?? []} />
      ) : null}
      <ParamMulti name="months" label="Renewal month" values={filters.months.map(String)} clears={clears} options={MONTH_OPTIONS} />
    </div>
  );
}
