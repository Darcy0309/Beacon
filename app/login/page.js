import { Lock } from "lucide-react";
import LighthouseBackdrop from "@/components/lighthouse-backdrop";
import SnowBackdrop from "@/components/snow-backdrop";
import LighthouseWordmark from "@/components/logo-wordmark";
import LoginForm from "@/components/login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }) {
  const params = await searchParams;
  const next = typeof params?.next === "string" && params.next.startsWith("/") ? params.next : "/";

  return (
    <div
      className="relative grid min-h-svh place-items-center overflow-hidden p-4"
      style={{ background: "radial-gradient(120% 90% at 50% -10%, #223258 0%, #0e1830 55%, #080d19 100%)" }}
    >
      <div className="pointer-events-none absolute -left-24 top-1/3 size-96 rounded-full blur-3xl" style={{ background: "rgb(245 177 32 / 0.12)" }} />
      <div className="pointer-events-none absolute -right-24 -top-24 size-[28rem] rounded-full blur-3xl" style={{ background: "rgb(43 87 201 / 0.20)" }} />
      <LighthouseBackdrop />
      <div className="pointer-events-none absolute inset-0"><SnowBackdrop /></div>

      <div className="relative w-full max-w-sm">
        <div className="mb-7 flex flex-col items-center gap-2 text-center">
          <LighthouseWordmark className="h-14 w-auto text-white" />
          <div className="text-sm text-white/55">Signature Marketing · Lead Management</div>
        </div>

        <LoginForm next={next} />

        <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-xs text-white/50">
          <Lock className="size-3" /> Access is restricted to approved IP addresses.
        </p>
        <p className="mt-1 text-center text-[0.7rem] text-white/35">
          Your workspace is tailored to your role after sign-in.
        </p>
      </div>
    </div>
  );
}
