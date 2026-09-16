"use client";

import { useActionState, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { signIn } from "@/lib/actions";

const EMPTY = { ok: false, data: null, error: null };

// The seeded accounts, so the workspace can be opened as any role.
const ACCOUNTS = {
  admin: { label: "Administrator", email: "admin@beacon.test" },
  manager: { label: "Account Manager", email: "sean@beacon.test" },
  agent: { label: "Agent", email: "agent@beacon.test" },
  client: { label: "Client", email: "client@beacon.test" },
};

const PASSWORD = "Beacon!2026";

const field =
  "h-9 w-full rounded-md border border-white/15 bg-white/5 px-3 text-sm text-white placeholder:text-white/40 outline-none transition-colors focus:border-white/30 focus:ring-2 focus:ring-white/20";

export default function LoginForm({ next = "/" }) {
  const [state, formAction, pending] = useActionState(signIn, EMPTY);
  const [selectedRole, setSelectedRole] = useState("admin");
  const [email, setEmail] = useState(ACCOUNTS.admin.email);
  const [password, setPassword] = useState(PASSWORD);

  return (
    <form
      action={formAction}
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
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@company.com"
          autoComplete="username"
          className={field}
        />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="password" className="text-sm font-medium text-white/80">Password</label>
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

      <div className="space-y-1.5">
        <label className="text-sm font-medium text-white/80">Sign in as</label>
        <div className="grid grid-cols-2 gap-2">
          {Object.entries(ACCOUNTS).map(([key, r]) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                setSelectedRole(key);
                setEmail(r.email);
                setPassword(PASSWORD);
              }}
              className={`rounded-md border px-3 py-2 text-xs font-medium transition-colors ${
                selectedRole === key
                  ? "border-white/40 bg-white/15 text-white"
                  : "border-white/12 bg-white/5 text-white/70 hover:bg-white/10"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {state?.error ? (
        <p className="rounded-md border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
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
