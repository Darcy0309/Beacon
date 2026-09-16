"use client";

import { useActionState, useState } from "react";
import { ArrowRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { signIn } from "@/lib/actions";

const EMPTY = { ok: false, data: null, error: null };

// The seeded accounts, so the workspace can be opened as any role.
const DEMO_ACCOUNTS = [
  { label: "Administrator", email: "admin@beacon.test" },
  { label: "Account Manager", email: "sean@beacon.test" },
  { label: "Agent", email: "agent@beacon.test" },
  { label: "Client", email: "client@beacon.test" },
];

const DEMO_PASSWORD = "Beacon!2026";

const field =
  "h-10 w-full rounded-lg border border-white/12 bg-white/[0.06] px-3.5 text-sm text-white placeholder:text-white/35 outline-none transition-[border,box-shadow] focus:border-beacon/50 focus:ring-2 focus:ring-beacon/25";

export default function LoginForm({ next = "/" }) {
  const [state, formAction, pending] = useActionState(signIn, EMPTY);
  const [email, setEmail] = useState(DEMO_ACCOUNTS[0].email);
  const [password, setPassword] = useState(DEMO_PASSWORD);

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="next" value={next} />

      <div className="space-y-1.5">
        <label htmlFor="email" className="text-sm font-medium text-white/75">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@company.com"
          autoComplete="username"
          className={field}
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="password" className="text-sm font-medium text-white/75">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          className={field}
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-white/75">Sign in as</label>
        <div className="grid grid-cols-2 gap-2">
          {DEMO_ACCOUNTS.map((a) => (
            <button
              key={a.email}
              type="button"
              onClick={() => {
                setEmail(a.email);
                setPassword(DEMO_PASSWORD);
              }}
              className={`rounded-lg border px-3 py-2.5 text-left text-xs font-medium transition-colors ${
                email === a.email
                  ? "border-beacon/45 bg-beacon/15 text-white"
                  : "border-white/10 bg-white/[0.04] text-white/65 hover:bg-white/[0.08]"
              }`}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>

      {state?.error ? (
        <p className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
          {state.error}
        </p>
      ) : null}

      <Button
        type="submit"
        disabled={pending}
        className="h-10 w-full gap-2 bg-beacon text-beacon-foreground hover:bg-beacon/90"
      >
        {pending ? (
          <>
            <Loader2 className="size-4 animate-spin" /> Signing in…
          </>
        ) : (
          <>
            Continue <ArrowRight className="size-4" />
          </>
        )}
      </Button>

      <button
        type="button"
        onClick={() => toast("Password resets are handled by your administrator.")}
        className="block w-full text-center text-xs text-white/45 transition-colors hover:text-white"
      >
        Forgot your password?
      </button>
    </form>
  );
}
