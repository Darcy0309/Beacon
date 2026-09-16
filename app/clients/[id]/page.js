import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import Topbar from "@/components/topbar";
import ToneBadge from "@/components/tone-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCompany, getProjectsByCompany } from "@/lib/queries";
import { colorFor, initials, cityState, shortName, longDate, slugify } from "@/lib/display";
import { PROJECT_TONE } from "@/lib/constants";

export const dynamic = "force-dynamic";

function Field({ label, children }) {
  return (
    <div>
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-sm">{children ?? "—"}</div>
    </div>
  );
}

export default async function ClientProfile({ params }) {
  const { id } = await params;
  const c = await getCompany(id);
  if (!c) notFound();

  const projects = await getProjectsByCompany(c.id);
  const delivery = `leads-${slugify(c.name)}@signaturemktg.net`;

  return (
    <>
      <Topbar title="Client" sub={c.name} />
      <div className="flex-1 space-y-4 p-4 sm:p-6">
        <Link
          href="/clients"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Back to clients
        </Link>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-4 border-b pb-5">
              <span
                className="flex size-14 items-center justify-center rounded-2xl text-base font-semibold text-white"
                style={{ background: colorFor(c.name) }}
              >
                {initials(c.name)}
              </span>
              <div>
                <h2 className="text-lg font-semibold">{c.name}</h2>
                <p className="text-sm text-muted-foreground">{cityState(c)}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-5 py-5 sm:grid-cols-3">
              <Field label="Account manager">{shortName(c.manager)}</Field>
              <Field label="Primary contact">
                {c.contact_name}
                {c.contact_title ? (
                  <span className="text-muted-foreground"> · {c.contact_title}</span>
                ) : null}
              </Field>
              <Field label="Phone">
                <span className="tabular-nums">{c.phone}</span>
              </Field>
              <Field label="Email">
                <span className="break-all">{c.email}</span>
              </Field>
              <Field label="Delivery email">
                <span className="break-all">{delivery}</span>
              </Field>
              <Field label="Timezone">{c.timezone?.name}</Field>
              <Field label="Active leads">
                <span className="tabular-nums">{c.leadCount}</span>
              </Field>
              <Field label="Appointments">
                <span className="tabular-nums">{c.apptCount}</span>
              </Field>
              <Field label="Subscription">
                {c.subscription_end ? `Through ${longDate(c.subscription_end)}` : null}
              </Field>
              <Field label="Status">
                <span
                  className={
                    c.status === "active" ? "font-medium text-emerald-600" : "text-muted-foreground"
                  }
                >
                  {c.status === "active" ? "Active" : "Inactive"}
                </span>
              </Field>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Projects</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 p-4">
            {projects.length === 0 && (
              <p className="px-2 text-sm text-muted-foreground">No projects on record.</p>
            )}
            {projects.map((p) => (
              <Link
                key={p.id}
                href={`/projects/${p.id}`}
                className="flex items-center justify-between rounded-lg border p-3 transition-colors hover:bg-muted/50"
              >
                <div className="flex items-center gap-3">
                  <span
                    className="flex size-8 items-center justify-center rounded-lg text-xs font-semibold text-white"
                    style={{ background: colorFor(p.name) }}
                  >
                    {initials(p.name)}
                  </span>
                  <div>
                    <div className="text-sm font-medium">{p.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {[p.type?.code, shortName(p.manager), `${p.leadCount} leads`]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                  </div>
                </div>
                {p.status ? (
                  <ToneBadge tone={PROJECT_TONE[p.status.name] ?? "slate"}>{p.status.name}</ToneBadge>
                ) : null}
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
