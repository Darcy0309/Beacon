import LighthouseWordmark from "@/components/brand/logo-wordmark";
import { LinkInfoForm } from "@/features/project-info/components/project-info-form";
import { carrierNames, infoByLink } from "@/features/project-info/server";
import { mediumDate } from "@/lib/format";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// A client's private link: never indexed, nor sent on to the sites its page links to.
export const metadata = {
  title: "Project Info — Lighthouse",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

/** The page around it: the wordmark, then what it is for. */
function Frame({ children }) {
  return (
    <div className="min-h-svh">
      <div className="mx-auto w-full max-w-3xl px-4 pt-8 sm:px-6">
        <LighthouseWordmark className="h-10 w-auto" />
      </div>
      <main className="mx-auto w-full max-w-3xl px-4 pb-6 pt-6 sm:px-6">{children}</main>
    </div>
  );
}

/**
 * A client's Project Info, from the private link sent as they come on board
 * (Sean, Oct 2026): no sign-in, the signed token in the address says which
 * project and until when. What they save goes straight to that project.
 */
export default async function ClientProfilePage({ params }) {
  const { token } = await params;
  const admin = createAdminClient();
  const opened = admin ? await infoByLink(admin, token) : { problem: "Project Info can't be opened right now. Please try again later." };

  if (opened.problem) {
    return (
      <Frame>
        <h1 className="text-xl font-bold tracking-tight">Project Info</h1>
        <p className="mt-3 text-sm text-muted-foreground" data-info-link-problem>{opened.problem}</p>
      </Frame>
    );
  }

  const { info, link } = opened;
  const carriers = await carrierNames(admin);
  return (
    <Frame>
      <h1 className="text-xl font-bold tracking-tight">Project Info</h1>
      <p className="mt-1 text-sm font-medium" data-info-for>{[info.client_name, info.project_name].filter(Boolean).join(" · ")}</p>
      <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
        Tell us about your agency and the appointments you want. Our account managers read this on every call they make for you;
        the producers you tick for leads get each lead and appointment by email, and the days to avoid stay off your calendar.
        Fill in what you can and save; you can come back to it with this link until {mediumDate(link.expires)}, and change it
        any time from your own Lighthouse sign-in.
      </p>
      <div className="mt-6">
        <LinkInfoForm info={info} carriers={carriers} token={token} />
      </div>
    </Frame>
  );
}
