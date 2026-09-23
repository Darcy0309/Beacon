"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ShieldCheck, ShieldOff, Smartphone, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { startTwoFactor, confirmTwoFactor, disableTwoFactor } from "@/lib/actions";

const EMPTY = { ok: false, data: null, error: null, fieldErrors: null, values: null };

/**
 * Turns an authenticator app on or off for the signed-in user. Enrolment is
 * three steps: ask the server for a secret, scan or type it into the app,
 * then prove it works with the first code.
 */
export default function TwoFactorSetup({ enabled, factors }) {
  const router = useRouter();
  const [setup, setSetup] = useState(null); // { factorId, qr, secret }
  const [copied, setCopied] = useState(false);
  const [starting, startTransition] = useTransition();
  const [removing, removeTransition] = useTransition();
  const [state, confirmAction, confirming] = useActionState(async (prev, formData) => {
    const result = await confirmTwoFactor(prev, formData);
    if (result.ok) {
      setSetup(null);
      toast.success("Two-factor is on. You'll be asked for a code next time you sign in.");
      router.refresh();
    }
    return result;
  }, EMPTY);

  const begin = () =>
    startTransition(async () => {
      const result = await startTwoFactor();
      if (result.ok) setSetup(result.data);
      else toast.error(result.error ?? "Could not start the setup.");
    });

  const turnOff = () =>
    removeTransition(async () => {
      const result = await disableTwoFactor();
      if (result.ok) {
        toast.success("Two-factor is off.");
        router.refresh();
      } else {
        toast.error(result.error ?? "Could not turn two-factor off.");
      }
    });

  const copySecret = async () => {
    try {
      await navigator.clipboard.writeText(setup.secret);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Copy failed — select the code and copy it by hand.");
    }
  };

  if (enabled) {
    return (
      <div className="space-y-4 p-5">
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-lg border border-emerald-400/40 bg-emerald-400/10 text-emerald-400">
            <ShieldCheck className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold">Two-factor is on</div>
            <div className="text-xs text-muted-foreground">
              {factors[0]?.name ? `${factors[0].name} · added ${factors[0].created}` : "Authenticator app"}
            </div>
          </div>
          <Button type="button" variant="outline" onClick={turnOff} disabled={removing}>
            <ShieldOff /> {removing ? "Turning off…" : "Turn off"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Signing in asks for your password and then a six-digit code. Keep a backup of your
          authenticator app — losing it means an administrator has to reset your access.
        </p>
      </div>
    );
  }

  if (!setup) {
    return (
      <div className="space-y-4 p-5">
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-lg border border-[var(--panel-border)] text-muted-foreground">
            <Smartphone className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold">Two-factor is off</div>
            <div className="text-xs text-muted-foreground">Your account is protected by a password alone.</div>
          </div>
          <Button type="button" onClick={begin} disabled={starting}>
            <ShieldCheck /> {starting ? "Preparing…" : "Set up"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          You'll need an authenticator app such as Google Authenticator, Microsoft Authenticator,
          1Password or Authy.
        </p>
      </div>
    );
  }

  return (
    <form action={confirmAction} className="space-y-5 p-5">
      <input type="hidden" name="factor_id" value={setup.factorId} />

      <ol className="space-y-5">
        <li className="space-y-2">
          <div className="eyebrow">Step 1 · Scan this code</div>
          <div className="flex flex-wrap items-start gap-4">
            {/* Already a complete data: URL — the action encodes it. */}
            <img
              src={setup.qr}
              alt="QR code for your authenticator app"
              className="size-40 shrink-0 rounded-lg border border-[var(--panel-border)] bg-white p-2"
            />
            <div className="min-w-0 flex-1 space-y-2">
              <p className="text-xs text-muted-foreground">
                Can't scan it? Type this key into your app instead:
              </p>
              <div className="flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded-md border border-[var(--panel-border)] bg-muted/40 px-2.5 py-1.5 font-mono text-xs">
                  {setup.secret}
                </code>
                <Button type="button" variant="outline" size="icon" onClick={copySecret} aria-label="Copy setup key">
                  {copied ? <Check className="size-4 text-emerald-400" /> : <Copy className="size-4" />}
                </Button>
              </div>
            </div>
          </div>
        </li>

        <li className="space-y-2">
          <div className="eyebrow">Step 2 · Enter the code it shows</div>
          <div className="flex flex-wrap items-start gap-2">
            <Input
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="000000"
              required
              autoFocus
              aria-invalid={state?.fieldErrors?.code ? true : undefined}
              className="w-32 text-center font-mono text-base tracking-[0.3em]"
            />
            <Button type="submit" disabled={confirming}>{confirming ? "Checking…" : "Turn on"}</Button>
            <Button type="button" variant="ghost" onClick={() => setSetup(null)}>Cancel</Button>
          </div>
          {state?.error ? (
            <p role="alert" className="text-[0.7rem] font-medium text-destructive">{state.error}</p>
          ) : null}
        </li>
      </ol>
    </form>
  );
}
