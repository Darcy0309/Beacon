import { Ban, Building2, CalendarX2, Landmark, MapPin, MessageSquareText, Navigation, Users } from "lucide-react";
import ToneBadge from "@/components/shared/tone-badge";
import { mapLink } from "@/lib/appointment-links";
import { mediumDate, telHref } from "@/lib/format";
import { addressLine, areaCode, directionsLink, hasProfile, producerName, weekdayList, yesNoOf, yesWith } from "@/lib/project-info";
import { cn } from "@/lib/utils";

const blank = (v) => v == null || v === "" || (Array.isArray(v) && v.length === 0);

/** A part of the Project Info, titled. */
function Section({ title, icon: Icon, name, children }) {
  return (
    <section data-info-section={name} className="border-b border-[var(--panel-border)] last:border-b-0">
      <h3 className="flex items-center gap-1.5 px-4 pb-1.5 pt-3 text-[0.62rem] font-bold uppercase tracking-[0.14em] text-muted-foreground">
        <Icon className="size-3.5 text-primary" aria-hidden /> {title}
      </h3>
      {children}
    </section>
  );
}

/** Label and value, striped, as the lead sheet's other tabs have them. */
function Rows({ rows }) {
  return (
    <div className="divide-y divide-[var(--panel-border)]">
      {rows.map(([key, label, value]) => (
        <div key={key} data-info-row={key} className="grid grid-cols-[minmax(8rem,40%)_1fr] gap-3 px-4 py-2 text-sm odd:bg-muted/30">
          <span className="text-muted-foreground">{label}</span>
          <span className="min-w-0 whitespace-pre-line break-words">{blank(value) ? <span className="text-muted-foreground">—</span> : value}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * A project's Project Info to read (Sean, Oct 2026): on a lead sheet's
 * Project Info tab while on the phone, on the project's page, and on the
 * client's own Project Info page. The agent and office first, with the area
 * code managers set their caller ID to, and the office's address a link:
 * with `toLead` (the lead's city), directions from the office to it in
 * Google Maps, for the miles and the drive time; else the office on the map.
 * Then the appointments it takes, the producers, the carriers and about the
 * agency. `action`: buttons for its top bar (Edit, Send to client). `wide`:
 * two columns on a wide screen.
 */
export default function ProjectInfoView({ info, toLead = null, action = null, wide = false, emptyHint = null }) {
  const office = addressLine(info);
  const code = areaCode(info.phone);
  const directions = toLead && office ? directionsLink(office, toLead) : null;
  const officeHref = directions ?? mapLink(office);
  const anything = hasProfile(info) || office || info.contact_name || info.phone;
  const shared = info.asked_id !== info.project_id
    ? `From ${info.project_name}, the appointment project this one promotes to.`
    : info.shared_with?.length ? `Also used by ${info.shared_with.join(", ")}.` : null;
  const stamp = info.updated_at
    ? `Updated ${mediumDate(info.updated_at)}${info.updated_via === "link" ? " by the client, from their link"
      : info.updated_by ? ` by ${info.updated_by}${info.updated_by_client ? " (client)" : ""}` : ""}`
    : null;

  const agent = (
    <Section title="Agent & office" icon={Building2} name="agent">
      <Rows rows={[
        ["agent", "Project agent", info.contact_name ? `${info.contact_name}${info.contact_title ? ` · ${info.contact_title}` : ""}` : null],
        ["office", "Address", office ? (
          <span>
            <a href={officeHref} target="_blank" rel="noreferrer" data-agent-address className="inline-flex items-start gap-1 text-primary hover:underline"
              title={directions ? `Directions from the agent's office to ${toLead}` : "The office on the map"}>
              <MapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {office}
            </a>
            {directions ? (
              <span className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                <Navigation className="size-3" aria-hidden /> Miles and drive time to {toLead}
              </span>
            ) : null}
          </span>
        ) : null],
        ["phone", "Phone", info.phone ? (
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {telHref(info.phone) ? <a href={telHref(info.phone)} className="tabular-nums hover:text-primary">{info.phone}</a> : <span className="tabular-nums">{info.phone}</span>}
            {code ? <ToneBadge tone="cyan" className="normal-case tracking-normal"><span data-area-code={code}>Caller ID area code {code}</span></ToneBadge> : null}
          </span>
        ) : null],
        ["mobile", "Mobile", info.agent_mobile ? <span className="tabular-nums">{info.agent_mobile}</span> : null],
        ["email", "Email", info.agent_email ? <a href={`mailto:${info.agent_email}`} className="break-all hover:text-primary">{info.agent_email}</a> : null],
        ["states", "States licensed", info.states_licensed.join(", ")],
      ]} />
    </Section>
  );

  const appointments = (
    <Section title="Appointments" icon={CalendarX2} name="appointments">
      <Rows rows={[
        ["avoid_days", "Days to avoid", info.avoid_days.length ? (
          <span className="inline-flex items-center gap-1.5 font-medium text-amber-600 dark:text-amber-300">
            <Ban className="size-3.5" aria-hidden /> {weekdayList(info.avoid_days, { plural: true })}
          </span>
        ) : null],
        ["min_employees", "Minimum employees", info.min_employees != null ? <span className="tabular-nums">{info.min_employees}</span> : null],
        ["personal_lines", "Personal home/auto", yesNoOf(info.personal_lines)],
        ["wc_mono", "Work comp only", yesWith(info.wc_mono, info.wc_min_employees, "employees")],
        ["auto_mono", "Commercial auto only", yesWith(info.auto_mono, info.auto_min_autos, "autos")],
        ["health_only", "Group health only", yesWith(info.health_only, info.health_min_lives, "covered lives")],
        ["quote_time", "Time to put a quote together", info.quote_time],
        ["quote_min_time", "Least time needed to quote", info.quote_min_time],
      ]} />
    </Section>
  );

  const producers = (
    <Section title="Producers taking appointments" icon={Users} name="producers">
      {info.producers.length ? (
        <ul className="divide-y divide-[var(--panel-border)]">
          {info.producers.map((p, i) => (
            <li key={i} data-producer-row={p.email || i} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-2 text-sm odd:bg-muted/30">
              <span className="min-w-0">
                <span className="font-medium">{producerName(p) || <span className="text-muted-foreground">No name</span>}</span>
                {p.email ? <a href={`mailto:${p.email}`} className="block break-all text-xs text-muted-foreground hover:text-primary">{p.email}</a> : null}
              </span>
              {p.leads ? <ToneBadge tone="emerald" className="normal-case tracking-normal"><span data-gets-leads>Gets leads by email</span></ToneBadge> : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-4 pb-3 text-sm text-muted-foreground">None listed yet.</p>
      )}
    </Section>
  );

  const carriers = (
    <Section title="Carriers" icon={Landmark} name="carriers">
      <Rows rows={[
        ["top_carriers", "Top carriers", info.top_carriers.join(", ")],
        ["avoid_carriers", "Can't compete with", info.avoid_carriers.join(", ")],
      ]} />
    </Section>
  );

  const about = (
    <Section title="About the agency" icon={MessageSquareText} name="about">
      <Rows rows={[
        ["special_programs", "Special programs & services", info.special_programs],
        ["value_added", "Value-added services", info.value_added],
        ["exclusive_program", "Exclusive programs", info.exclusive_program],
        ["industry_notes", "In the industry", info.industry_notes],
      ]} />
    </Section>
  );

  return (
    <div data-project-info={info.project_id}>
      {action || shared || stamp ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--panel-border)] px-4 py-2">
          <div className="min-w-0 text-xs text-muted-foreground">
            {shared ? <p data-info-shared>{shared}</p> : null}
            {stamp ? <p data-info-stamp>{stamp}</p> : null}
          </div>
          {action ? <div className="ml-auto flex flex-wrap items-center gap-2">{action}</div> : null}
        </div>
      ) : null}
      {anything ? null : (
        <p className="border-b border-[var(--panel-border)] px-4 py-3 text-sm text-muted-foreground" data-info-empty>
          No Project Info yet.{emptyHint ? ` ${emptyHint}` : ""}
        </p>
      )}
      <div className={cn(wide && "lg:grid lg:grid-cols-2 lg:divide-x lg:divide-[var(--panel-border)]")}>
        <div>{agent}{appointments}</div>
        <div className={cn("border-t border-[var(--panel-border)]", wide && "lg:border-t-0")}>{producers}{carriers}{about}</div>
      </div>
    </div>
  );
}
