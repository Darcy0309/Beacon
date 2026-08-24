"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import BeaconBackdrop from "@/components/beacon-backdrop";
import SnowBackdrop from "@/components/snow-backdrop";
import BeaconLogo from "@/components/logo";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("seanf");

  function signIn(e) {
    e.preventDefault();
    toast.success("Signed in — welcome back, Sean");
    router.push("/");
  }

  const field =
    "h-9 w-full rounded-md border border-white/15 bg-white/5 px-3 text-sm text-white placeholder:text-white/40 outline-none transition-colors focus:border-white/30 focus:ring-2 focus:ring-white/20";

  return (
    <div
      className="relative grid min-h-svh place-items-center overflow-hidden p-4"
      style={{ background: "radial-gradient(120% 90% at 50% -10%, #223258 0%, #0e1830 55%, #080d19 100%)" }}
    >
      {/* stylish glows + motifs */}
      <div className="pointer-events-none absolute -left-24 top-1/3 size-96 rounded-full blur-3xl" style={{ background: "rgb(245 177 32 / 0.12)" }} />
      <div className="pointer-events-none absolute -right-24 -top-24 size-[28rem] rounded-full blur-3xl" style={{ background: "rgb(43 87 201 / 0.20)" }} />
      <BeaconBackdrop />
      <div className="pointer-events-none absolute inset-0"><SnowBackdrop /></div>

      <div className="relative w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/15 backdrop-blur">
            <BeaconLogo className="size-8 text-white" />
          </div>
          <div>
            <div className="text-2xl font-semibold tracking-tight text-white">Beacon</div>
            <div className="text-sm text-white/55">Signature Marketing · Lead Management</div>
          </div>
        </div>

        <form onSubmit={signIn} className="space-y-4 rounded-2xl border border-white/12 bg-white/8 p-6 shadow-2xl backdrop-blur-xl">
          <div className="space-y-1.5">
            <label htmlFor="username" className="text-sm font-medium text-white/80">Username</label>
            <input id="username" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="username" autoComplete="username" className={field} />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="password" className="text-sm font-medium text-white/80">Password</label>
            <input id="password" type="password" defaultValue="password" autoComplete="current-password" className={field} />
          </div>
          <Button type="submit" className="w-full">Sign in</Button>
          <button
            type="button"
            onClick={() => toast("Your account credentials have been emailed to you")}
            className="block w-full text-center text-xs text-white/55 transition-colors hover:text-white hover:underline"
          >
            Forgot your password?
          </button>
        </form>

        <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-xs text-white/50">
          <Lock className="size-3" /> Access is restricted to approved IP addresses.
        </p>
        <p className="mt-1 text-center text-[0.7rem] text-white/35">
          Design preview · you’ll be routed to your workspace by role after sign-in.
        </p>
      </div>
    </div>
  );
}
