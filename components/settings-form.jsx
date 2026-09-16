"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { saveSetting, addIpAddress, removeIpAddress } from "@/lib/actions";

const EMPTY = { ok: false, data: null, error: null };

/** One settings card; posts the whole group back as a JSON value. */
function SettingsGroup({ title, settingKey, fields, values }) {
  const [state, formAction, pending] = useActionState(saveSetting, EMPTY);
  const router = useRouter();

  useEffect(() => {
    if (state?.ok) {
      toast.success(`${title} saved`);
      router.refresh();
    } else if (state?.error) {
      toast.error(state.error);
    }
  }, [state, title, router]);

  const [draft, setDraft] = useState(values ?? {});

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="key" value={settingKey} />
          <input type="hidden" name="value" value={JSON.stringify(draft)} />

          {fields.map((f) => (
            <Field key={f.name} label={f.label}>
              <Input
                value={draft[f.name] ?? ""}
                type={f.type ?? "text"}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    [f.name]: f.type === "number" ? Number(e.target.value) : e.target.value,
                  }))
                }
              />
            </Field>
          ))}

          <div className="flex justify-end">
            <Button size="sm" type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function IpWhitelist({ rows }) {
  const [state, formAction, pending] = useActionState(addIpAddress, EMPTY);
  const [removing, startTransition] = useTransition();
  const router = useRouter();

  useEffect(() => {
    if (state?.ok) {
      toast.success("IP address added");
      router.refresh();
    } else if (state?.error) {
      toast.error(state.error);
    }
  }, [state, router]);

  function remove(id) {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("id", String(id));
      const res = await removeIpAddress(fd);
      if (res?.ok === false) toast.error(res.error);
      else {
        toast.success("IP address removed");
        router.refresh();
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>IP Lockdown</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="divide-y rounded-lg border">
          {rows.map((r) => (
            <div key={r.id} data-list-row className="flex items-center justify-between gap-3 px-4 py-2.5">
              <div className="min-w-0">
                <span className="font-mono text-sm">{r.ip_address}</span>
                {r.label ? (
                  <span className="ml-2 text-xs text-muted-foreground">{r.label}</span>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => remove(r.id)}
                disabled={removing}
                aria-label={`Remove ${r.ip_address}`}
                className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          ))}
          {rows.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">
              No IP restrictions — all addresses may sign in.
            </p>
          )}
        </div>

        <form action={formAction} className="flex flex-wrap items-end gap-2">
          <Field label="IP address or CIDR" className="min-w-[12rem] flex-1">
            <Input name="ip_address" placeholder="203.0.113.0/24" required />
          </Field>
          <Field label="Label" className="min-w-[10rem] flex-1">
            <Input name="label" placeholder="Head office" />
          </Field>
          <Button size="sm" type="submit" disabled={pending}>
            <Plus /> Add
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export default function SettingsForm({ settings, ipWhitelist }) {
  return (
    <>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SettingsGroup
          title="Organization"
          settingKey="organization"
          values={settings.organization}
          fields={[
            { name: "name", label: "Company name" },
            { name: "email", label: "Contact email" },
            { name: "phone", label: "Phone" },
            { name: "timezone", label: "Default timezone" },
          ]}
        />
        <SettingsGroup
          title="Email (SMTP)"
          settingKey="mail"
          values={settings.mail}
          fields={[
            { name: "host", label: "SMTP host" },
            { name: "port", label: "Port", type: "number" },
            { name: "from", label: "From address" },
            { name: "provider", label: "Provider" },
          ]}
        />
        <SettingsGroup
          title="Branding"
          settingKey="branding"
          values={settings.branding}
          fields={[
            { name: "primary", label: "Primary colour" },
            { name: "accent", label: "Accent colour" },
            { name: "logo", label: "Logo path" },
          ]}
        />
        <SettingsGroup
          title="Security"
          settingKey="security"
          values={settings.security}
          fields={[
            { name: "session_timeout_min", label: "Session timeout (minutes)", type: "number" },
            { name: "password_min_length", label: "Minimum password length", type: "number" },
          ]}
        />
      </div>

      <IpWhitelist rows={ipWhitelist} />
    </>
  );
}
