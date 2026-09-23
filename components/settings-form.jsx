"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import SectionHeader from "@/components/section-header";
import { Palette, Mail, ShieldCheck } from "lucide-react";
import { Input } from "@/components/ui/input";
import { saveSettings } from "@/lib/actions";

const EMPTY = { ok: false, data: null, error: null, fieldErrors: null, values: null };

function Field({ label, children, error, hint, required }) {
  return (
    <div className="space-y-1.5">
      <label className="eyebrow">
        {label}
        {required ? <span className="ml-0.5 text-destructive" aria-hidden>*</span> : null}
      </label>
      {children}
      {error ? (
        <p role="alert" className="text-[0.7rem] font-medium text-destructive">{error}</p>
      ) : hint ? (
        <p className="text-[0.7rem] text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

export default function SettingsForm({ settings }) {
  const [state, formAction, pending] = useActionState(saveSettings, EMPTY);
  const router = useRouter();

  const org = settings.organization ?? {};
  const mail = settings.mail ?? {};
  const branding = settings.branding ?? {};

  useEffect(() => {
    if (state?.ok) {
      toast.success("Settings saved");
      router.refresh();
    } else if (state?.error && !state?.fieldErrors) {
      toast.error(state.error);
    }
  }, [state, router]);

  const fe = (k) => state?.fieldErrors?.[k];
  const inv = (k) => (fe(k) ? true : undefined);
  const sv = state?.values ?? null;
  const dv = (k, fallback) => (sv && k in sv ? sv[k] : fallback);

  return (
    <form action={formAction} noValidate className="space-y-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <SectionHeader label="Branding" icon={Palette} />
          <div className="space-y-4 p-5">
            <Field label="Company name" required error={fe("org_name")}>
              <Input name="org_name" required maxLength={80} defaultValue={dv("org_name", org.name ?? "")} aria-invalid={inv("org_name")} />
            </Field>
            <Field label="Product name" error={fe("product_name")}>
              <Input name="product_name" maxLength={40} defaultValue={dv("product_name", branding.product ?? "Lighthouse")} aria-invalid={inv("product_name")} />
            </Field>
            <Field label="Logo URL" error={fe("logo")} hint="https://… or a path like /logo.svg">
              <Input name="logo" type="url" maxLength={200} placeholder="/logo.svg" defaultValue={dv("logo", branding.logo ?? "")} aria-invalid={inv("logo")} />
            </Field>
          </div>
        </Card>

        <Card>
          <SectionHeader label="Email (SMTP)" icon={Mail} />
          <div className="space-y-4 p-5">
            <Field label="SMTP host" error={fe("mail_host")}>
              <Input name="mail_host" placeholder="smtp.office365.com" defaultValue={dv("mail_host", mail.host ?? "")} aria-invalid={inv("mail_host")} />
            </Field>
            <Field label="From address" error={fe("mail_from")}>
              <Input name="mail_from" type="email" inputMode="email" defaultValue={dv("mail_from", mail.from ?? "")} aria-invalid={inv("mail_from")} />
            </Field>
            <Field label="Authentication" error={fe("mail_provider")}>
              <Input name="mail_provider" maxLength={40} defaultValue={dv("mail_provider", mail.provider ?? "")} aria-invalid={inv("mail_provider")} />
            </Field>
          </div>
        </Card>
      </div>

      <Card>
        <SectionHeader label="Sign-in Security" icon={ShieldCheck} />
        <div className="space-y-3 p-5 text-sm text-muted-foreground">
          <p>
            Accounts are protected by a password plus an optional authenticator app.
            IP lockdown was retired: it broke whenever somebody worked from a different
            desk, and did nothing against a stolen password.
          </p>
          <p>
            Each person turns two-factor on for themselves under{" "}
            <Link href="/security" className="font-medium text-primary hover:underline">My Security</Link>.
            Who has it on is shown on the{" "}
            <Link href="/users" className="font-medium text-primary hover:underline">Users &amp; Access</Link> page.
          </p>
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
