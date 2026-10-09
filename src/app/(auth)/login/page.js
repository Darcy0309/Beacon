import { Lock } from "lucide-react";
import LighthouseBackdrop from "@/components/brand/lighthouse-backdrop";
import SnowBackdrop from "@/components/brand/snow-backdrop";
import LighthouseWordmark from "@/components/brand/logo-wordmark";
import LoginForm from "@/features/auth/components/login-form";
import EmailLinkHandoff from "@/features/auth/components/email-link-handoff";
import { safeInternalPath } from "@/lib/validate";

export const dynamic = "force-dynamic";

const NOTICES = {
  link: "That sign-in link has expired or was already used. Ask an administrator for a new invitation.",
  disabled: "This account has been disabled. Contact an administrator.",
  idle: "You were signed out after 30 minutes without activity, to keep your account safe. Sign in to carry on.",
};

export default async function LoginPage({ searchParams }) {
  const params = await searchParams;
  // Only a path inside the app — never somewhere a link could send people after they sign in.
  const next = safeInternalPath(params?.next, "/");
  // Own keys only: "?error=constructor" must not find Object.prototype.constructor.
  const notice = Object.hasOwn(NOTICES, params?.error ?? "") ? NOTICES[params.error] : null;

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
          <LighthouseWordmark className="h-16 w-auto" tone="dark" />
          <div className="text-sm text-white/55">Signature Marketing · Lead Management</div>
        </div>

        <EmailLinkHandoff />
        {notice ? (
          <p role="alert" className="mb-4 rounded-lg border border-amber-400/40 bg-amber-400/10 px-4 py-3 text-center text-sm text-amber-200">
            {notice}
          </p>
        ) : null}

        <LoginForm next={next} />

        <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-xs text-white/50">
          <Lock className="size-3" /> Protected by two-factor authentication.
        </p>
        <p className="mt-1 text-center text-[0.7rem] text-white/35">
          Your workspace is tailored to your role after sign-in.
        </p>
      </div>
    </div>
  );
}
