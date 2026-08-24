"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Radar, Lock } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("seanf");

  function signIn(e) {
    e.preventDefault();
    toast.success("Signed in — welcome back, Sean");
    router.push("/");
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-auto bg-background p-4">
      <div className="pointer-events-none absolute -top-32 left-1/2 size-96 -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />

      <div className="relative w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-sky-400 text-white shadow-lg shadow-primary/30">
            <Radar className="size-6" />
          </div>
          <div>
            <div className="text-xl font-semibold tracking-tight">Beacon</div>
            <div className="text-sm text-muted-foreground">Signature Marketing · Lead Management</div>
          </div>
        </div>

        <form onSubmit={signIn} className="space-y-4 rounded-2xl border bg-card p-6 shadow-sm">
          <div className="space-y-1.5">
            <label htmlFor="username" className="text-sm font-medium">Username</label>
            <Input id="username" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="username" autoComplete="username" />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="password" className="text-sm font-medium">Password</label>
            <Input id="password" type="password" defaultValue="password" autoComplete="current-password" />
          </div>
          <Button type="submit" className="w-full">Sign in</Button>
          <button
            type="button"
            onClick={() => toast("Your account credentials have been emailed to you")}
            className="block w-full text-center text-xs text-muted-foreground transition-colors hover:text-foreground hover:underline"
          >
            Forgot your password?
          </button>
        </form>

        <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
          <Lock className="size-3" /> Access is restricted to approved IP addresses.
        </p>
        <p className="mt-1 text-center text-[0.7rem] text-muted-foreground/70">
          Design preview · you’ll be routed to your workspace by role after sign-in.
        </p>
      </div>
    </div>
  );
}
