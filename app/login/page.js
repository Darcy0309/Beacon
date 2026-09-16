import { Lock } from "lucide-react";
import BeaconBackdrop from "@/components/beacon-backdrop";
import BeaconWordmark from "@/components/logo-wordmark";
import LoginForm from "@/components/login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }) {
  const params = await searchParams;
  const next = typeof params?.next === "string" && params.next.startsWith("/") ? params.next : "/";

  return (
    <div className="relative grid min-h-svh lg:grid-cols-2">
      {/* Brand panel */}
      <div
        className="relative hidden overflow-hidden lg:flex lg:flex-col lg:justify-between lg:p-12"
        style={{
          background: "linear-gradient(165deg, #0c1628 0%, #152a4a 42%, #1a2540 78%, #0e1524 100%)",
        }}
      >
        <BeaconBackdrop />
        <div
          aria-hidden
          className="pointer-events-none absolute -left-20 top-1/4 size-[28rem] rounded-full blur-3xl"
          style={{ background: "rgb(232 160 32 / 0.14)" }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -right-16 bottom-0 size-[22rem] rounded-full blur-3xl"
          style={{ background: "rgb(42 82 148 / 0.35)" }}
        />

        <div className="relative z-10">
          <BeaconWordmark className="h-12 w-auto text-white" />
          <p className="mt-3 text-xs font-medium uppercase tracking-[0.18em] text-white/45">
            Signature Marketing
          </p>
        </div>

        <div className="relative z-10 max-w-md">
          <h2 className="text-4xl font-semibold leading-[1.15] tracking-tight text-white">
            Find the signal.
            <span className="mt-2 block text-beacon">Deliver the lead.</span>
          </h2>
          <p className="mt-5 text-base leading-relaxed text-white/55">
            Qualify prospects, set appointments, and route X-date opportunities to the agencies that bought them.
          </p>
        </div>

        <p className="relative z-10 text-xs text-white/35">
          Lead generation &amp; appointment CRM
        </p>
      </div>

      {/* Form panel */}
      <div
        className="relative flex items-center justify-center overflow-hidden p-6 sm:p-10"
        style={{
          background: "radial-gradient(120% 80% at 50% -20%, #1a2d4d 0%, #0e1524 55%, #0a101c 100%)",
        }}
      >
        <div className="pointer-events-none absolute inset-0 lg:hidden">
          <BeaconBackdrop />
        </div>

        <div className="relative w-full max-w-[24rem]">
          <div className="mb-8 lg:mb-10">
            <div className="mb-6 lg:hidden">
              <BeaconWordmark className="h-11 w-auto text-white" />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-white">Sign in</h1>
            <p className="mt-1.5 text-sm text-white/50">Your workspace opens to your role.</p>
          </div>

          <LoginForm next={next} />

          <p className="mt-8 flex items-center justify-center gap-1.5 text-center text-xs text-white/40">
            <Lock className="size-3" /> Access restricted to approved IP addresses
          </p>
        </div>
      </div>
    </div>
  );
}
