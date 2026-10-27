import LighthouseWordmark from "@/components/brand/logo-wordmark";
import ListBuilderForm from "@/features/list-builder/components/list-builder-form";
import { getSicRows } from "@/features/list-builder/queries";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// A prospect's private link: never indexed, nor sent on.
export const metadata = {
  title: "Your list request — Signature Marketing",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

/**
 * A prospect's list request, from the link we send (Sean, Oct 2026): no
 * sign-in. They say who they are and pick the businesses they want to
 * target; it comes to the link's Sales Rep and our administrators.
 */
export default async function ProspectRequestPage({ params }) {
  const { token } = await params;
  const supabase = await createClient();
  const { data } = /^[0-9a-f]{20,80}$/.test(token) ? await supabase.rpc("list_request_link", { p_token: token }) : { data: null };
  const link = data?.[0] ?? null;
  const rows = link?.ok ? await getSicRows(supabase) : [];
  return (
    <div className="min-h-svh">
      <div className="mx-auto w-full max-w-5xl px-4 pt-8 sm:px-6"><LighthouseWordmark className="h-10 w-auto" /></div>
      <main className="mx-auto w-full max-w-5xl px-4 pb-10 pt-6 sm:px-6">
        <h1 className="text-xl font-bold tracking-tight">The businesses you want to reach</h1>
        {link?.ok ? (
          <>
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground" data-request-intro>
              Pick the industries (open a sector with + and tick what you want), the size of business, and where they are.
              {link.rep ? ` It goes to ${link.rep}, who will be in touch.` : " We'll be in touch."}
            </p>
            <div className="mt-6"><ListBuilderForm mode="prospect" rows={rows} token={token} /></div>
          </>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground" data-request-link-problem>This link is no longer open. Ask us for a new one.</p>
        )}
      </main>
    </div>
  );
}
