import { KeyRound } from "lucide-react";
import LighthouseWordmark from "@/components/brand/logo-wordmark";

export const dynamic = "force-dynamic";

/**
 * Where a "Forgot your password?" email lands (Nov 2026: Sean's reset link went to the error page). The link
 * carries a one-time token that works in any browser, not only the one that asked (a code needed that one's
 * own half to finish). Opening it changes nothing: the button does, so an email scanner that opens links to
 * check them can't use it up before the person gets there.
 */
export default async function ResetPage({ searchParams }) {
  const params = await searchParams;
  const token = typeof params?.token_hash === "string" && /^[A-Za-z0-9_-]{8,200}$/.test(params.token_hash) ? params.token_hash : "";
  return (
    <div className="grid min-h-svh place-items-center p-4"
      style={{ background: "radial-gradient(120% 90% at 50% -10%, #223258 0%, #0e1830 55%, #080d19 100%)" }}>
      <div className="flex w-full max-w-sm flex-col items-center gap-6 text-center text-white" data-reset-page>
        <LighthouseWordmark className="h-14 w-auto" />
        {token ? (
          <form action="/auth/reset/verify" method="post" className="flex w-full flex-col items-center gap-4">
            <input type="hidden" name="token_hash" value={token} />
            <p className="text-sm text-white/75">Set a new password for your Lighthouse account.</p>
            <button type="submit" data-reset-continue
              className="inline-flex items-center gap-2 rounded-md bg-cyan-400 px-5 py-2.5 text-sm font-bold text-slate-950 transition-colors hover:bg-cyan-300">
              <KeyRound className="size-4" aria-hidden /> Set a new password
            </button>
          </form>
        ) : (
          <p className="text-sm text-white/75" data-reset-bad>
            That password reset link isn&apos;t complete. Ask for a new one with <a href="/login" className="font-semibold text-cyan-300 underline">Forgot your password?</a> on the sign-in page.
          </p>
        )}
      </div>
    </div>
  );
}
