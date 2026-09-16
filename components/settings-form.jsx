"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import SectionHeader from "@/components/section-header";
import { Palette, Mail, Lock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { saveSettings } from "@/lib/actions";

const EMPTY = { ok: false, data: null, error: null };

function Field({ label, children }) {
  return (
    <div className="space-y-1.5">
      <label className="eyebrow">{label}</label>
      {children}
    </div>
  );
}

export default function SettingsForm({ settings, ipWhitelist }) {
  const [state, formAction, pending] = useActionState(saveSettings, EMPTY);
  const router = useRouter();

  const org = settings.organization ?? {};
  const mail = settings.mail ?? {};
  const branding = settings.branding ?? {};

  const [ips, setIps] = useState(
    ipWhitelist.map((r) => r.ip_address).join("\n")
  );

  useEffect(() => {
    if (state?.ok) {
      toast.success("Settings saved");
      router.refresh();
    } else if (state?.error) {
      toast.error(state.error);
    }
  }, [state, router]);

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <SectionHeader label="Branding" icon={Palette} />
          <div className="space-y-4 p-5">
            <Field label="Company name">
              <Input name="org_name" defaultValue={org.name ?? ""} />
            </Field>
            <Field label="Product name">
              <Input name="product_name" defaultValue={branding.product ?? "Beacon"} />
            </Field>
            <Field label="Logo URL">
              <Input name="logo" defaultValue={branding.logo ?? ""} />
            </Field>
          </div>
        </Card>

        <Card>
          <SectionHeader label="Email (SMTP)" icon={Mail} />
          <div className="space-y-4 p-5">
            <Field label="SMTP host">
              <Input name="mail_host" defaultValue={mail.host ?? ""} />
            </Field>
            <Field label="From address">
              <Input name="mail_from" defaultValue={mail.from ?? ""} />
            </Field>
            <Field label="Authentication">
              <Input name="mail_provider" defaultValue={mail.provider ?? ""} />
            </Field>
          </div>
        </Card>
      </div>

      <Card>
        <SectionHeader label="IP Lockdown" icon={Lock} />
        <div className="space-y-4 p-5">
          <Field label="Allowed IP addresses (one per line)">
            <Textarea
              name="ip_whitelist"
              value={ips}
              onChange={(e) => setIps(e.target.value)}
              className="min-h-28 font-mono text-xs"
            />
          </Field>
        </div>
      </Card>

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
