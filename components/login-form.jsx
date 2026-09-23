"use client";

import { useActionState, useState } from "react";
import { toast } from "sonner";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { signIn, verifyTwoFactor } from "@/lib/actions";

const EMPTY = { ok: false, data: null, error: null, fieldErrors: null, values: null };

const field =
  "h-9 w-full rounded-md border border-white/15 bg-white/5 px-3 text-sm text-white placeholder:text-white/40 outline-none transition-colors focus:border-white/30 focus:ring-2 focus:ring-white/20";

export default function LoginForm({ next = "/" }) {
  // The password step reports `mfa` when the account has an authenticator,
  // which swaps this form for the code step.
  const [state, formAction, pending] = useActionState(signIn, EMPTY);

  if (state?.mfa) return <TwoFactorStep next={next} />;

  return (
    <form
      action={formAction}
      noValidate
      className="space-y-4 rounded-2xl border border-white/12 bg-white/8 p-6 shadow-2xl backdrop-blur-xl"
    >
      <input type="hidden" name="next" value={next} />

      <div className="space-y-1.5">
        <label htmlFor="email" className="text-sm font-medium text-white/80">Email</label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoFocus
          defaultValue={state?.values?.email ?? ""}
          placeholder="you@company.com"
          autoComplete="username"
          aria-invalid={state?.fieldErrors?.email ? true : undefined}
          className={`${field} ${state?.fieldErrors?.email ? "border-rose-400/60" : ""}`}
        />
        {state?.fieldErrors?.email ? <p role="alert" className="text-xs text-rose-300">{state.fieldErrors.email}</p> : null}
      </div>

      <div className="space-y-1.5">
        <label htmlFor="password" className="text-sm font-medium text-white/80">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          aria-invalid={state?.fieldErrors?.password ? true : undefined}
          className={`${field} ${state?.fieldErrors?.password ? "border-rose-400/60" : ""}`}
        />
        {state?.fieldErrors?.password ? <p role="alert" className="text-xs text-rose-300">{state.fieldErrors.password}</p> : null}
      </div>

      {state?.error && !state?.fieldErrors ? (
        <p role="alert" className="rounded-md border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
          {state.error}
        </p>
      ) : null}

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </Button>
      <button
        type="button"
        onClick={() => toast("Password resets are handled by your administrator.")}
        className="block w-full text-center text-xs text-white/55 transition-colors hover:text-white hover:underline"
      >
        Forgot your password?
      </button>
    </form>
  );
}

/** Second step: the six-digit code from the user's authenticator app. */
function TwoFactorStep({ next }) {
  const [state, formAction, pending] = useActionState(verifyTwoFactor, EMPTY);
  const [code, setCode] = useState("");

  return (
    <form
      action={formAction}
      noValidate
      className="space-y-4 rounded-2xl border border-white/12 bg-white/8 p-6 shadow-2xl backdrop-blur-xl"
    >
      <input type="hidden" name="next" value={next} />

      <div className="flex items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-white/20 bg-white/10 text-white">
          <ShieldCheck className="size-4" />
        </span>
        <div>
          <div className="text-sm font-semibold text-white">Two-factor required</div>
          <div className="text-xs text-white/60">Enter the code from your authenticator app.</div>
        </div>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="code" className="text-sm font-medium text-white/80">Six-digit code</label>
        <input
          id="code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          required
          autoFocus
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          placeholder="000000"
          aria-invalid={state?.fieldErrors?.code ? true : undefined}
          className={`${field} text-center font-mono text-base tracking-[0.4em] ${state?.fieldErrors?.code ? "border-rose-400/60" : ""}`}
        />
      </div>

      {state?.error ? (
        <p role="alert" className="rounded-md border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
          {state.error}
        </p>
      ) : null}

      <Button type="submit" className="w-full" disabled={pending || code.length < 6}>
        {pending ? "Checking…" : "Verify and continue"}
      </Button>
      <p className="text-center text-xs text-white/50">
        Lost your authenticator? Ask an administrator to reset it.
      </p>
    </form>
  );
}
