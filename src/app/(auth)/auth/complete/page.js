import LighthouseWordmark from "@/components/brand/logo-wordmark";
import AuthComplete from "@/features/auth/components/auth-complete";
import { safeInternalPath } from "@/lib/validate";

export const dynamic = "force-dynamic";

/** Second half of /auth/callback for links that carry tokens in the fragment. */
export default async function AuthCompletePage({ searchParams }) {
  const params = await searchParams;
  const next = safeInternalPath(params?.next, "/security?welcome=1");
  return (
    <div className="grid min-h-svh place-items-center p-4">
      <div className="flex flex-col items-center gap-6 text-center">
        <LighthouseWordmark className="h-12 w-auto" />
        <AuthComplete next={next} />
      </div>
    </div>
  );
}
