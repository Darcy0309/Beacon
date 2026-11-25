"use client";

import { useEffect } from "react";
import Link from "@/components/shared/intent-link";
import { usePathname, useRouter } from "next/navigation";
import { ShieldOff, UserX, LogOut } from "lucide-react";
import AppSidebar from "@/components/layout/app-sidebar";
import Topbar from "@/components/layout/topbar";
import { Card } from "@/components/ui/card";
import { useRole } from "@/components/layout/role-provider";
import { mayOpen } from "@/lib/nav";
import { forgetPushThenSubmit } from "@/features/notifications/desktop";
import ActivityTracker from "@/features/pay/components/activity-tracker";
import IdleGuard from "@/features/auth/components/idle-guard";
import ExpandRowGuard from "@/components/layout/expand-row-guard";
import { idleLimitFor } from "@/lib/idle";
import { PhoneProvider } from "@/features/phone/phone";
import NavigationProgress from "@/components/layout/navigation-progress";

/**
 * The chrome around every workspace page: sidebar, access checks, and the
 * screens for accounts that cannot use the workspace yet (invited) or any
 * more (disabled). Sign-in and setup pages live in the (auth) route group
 * and never render this.
 */
export default function WorkspaceShell({ children }) {
  const path = usePathname();
  const router = useRouter();
  const { role, user } = useRole();

  const invited = user?.status === "invited";
  // A temporary password an administrator gave them: their own comes first.
  const temporary = !invited && Boolean(user?.must_change_password);

  // An invited account has no role until it sets a password, so nothing else
  // would show it anything. Take it to the password form first; likewise
  // someone signed in with a temporary password.
  useEffect(() => {
    if (invited && path !== "/security") router.replace("/security?welcome=1");
    else if (temporary && path !== "/security") router.replace("/security?temporary=1");
  }, [invited, temporary, path, router]);

  // Signed in, but no account to go with it (Sean, Nov 2026: signed in as a test client that was deleted later): the
  // database hides a deleted account's row, so every page would fail. This says so, with a way out, instead of an
  // error page he couldn't leave; and Try again, for a moment the account couldn't be read.
  if (!user) return <AccountMissing />;
  // The database already refuses a disabled account everything. This just
  // says so, with a way out, instead of a workspace full of empty tables.
  if (user?.status === "disabled") return <AccountDisabled email={user.email} />;
  // A client whose Signature Select has ended (Sean, Nov 2026): the database shows them nothing now; this says why.
  if (user?.role === "client" && user?.signatureSelect?.ended) return <SelectEnded endsOn={user.signatureSelect.endsOn} />;

  // A page this role cannot open — reached by typing the URL or following an
  // old link. Row Level Security already keeps the data out of reach; this
  // just says so plainly instead of rendering an empty screen.
  const denied = mayOpen(path, role, user) === false && !(invited && path === "/security");

  // Time worked counts for the people paid by it: account managers and agents.
  const tracked = (role === "manager" || role === "agent") && user?.status === "active";
  // Signed out after a time without activity (Settings): everyone but administrators.
  const guarded = Boolean(user) && idleLimitFor(role) != null;

  // The phone, for the staff who call: administrators, account managers and agents.
  const calls = ["admin", "manager", "agent"].includes(role) && user?.status === "active";

  const shell = (
    <div className="flex min-h-svh">
      <NavigationProgress />
      {tracked ? <ActivityTracker /> : null}
      {guarded ? <IdleGuard /> : null}
      <ExpandRowGuard />
      <AppSidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-x-clip">
        {denied ? <NoAccess /> : children}
      </div>
    </div>
  );
  return calls ? <PhoneProvider tracked={tracked}>{shell}</PhoneProvider> : shell;
}

/** A client's Signature Select over, not renewed: their access to Lighthouse stops until it is. */
function SelectEnded({ endsOn }) {
  const ended = endsOn ? new Date(`${endsOn}T12:00:00`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : null;
  return (
    <div className="flex min-h-svh flex-1 items-center justify-center p-6" data-select-ended>
      <Card className="max-w-md p-8 text-center">
        <span className="mx-auto flex size-12 items-center justify-center rounded-xl border border-[var(--panel-border)] text-muted-foreground">
          <ShieldOff className="size-5" />
        </span>
        <h2 className="mt-4 text-base font-semibold">Your Signature Select subscription has ended</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {ended ? <>It ended on {ended}. </> : null}
          Contact your Sales Rep to renew it, and your access to Lighthouse comes back right away.
        </p>
        <form action="/auth/sign-out" method="post" onSubmit={forgetPushThenSubmit} className="mt-5">
          <button
            type="submit"
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-[var(--panel-border)] px-3 py-1.5 text-[0.66rem] font-bold uppercase tracking-[0.14em] text-primary transition-colors hover:border-primary/40"
          >
            <LogOut className="size-3.5" /> Sign out
          </button>
        </form>
      </Card>
    </div>
  );
}

function AccountDisabled({ email }) {
  return (
    <div className="flex min-h-svh flex-1 items-center justify-center p-6">
      <Card className="max-w-md p-8 text-center">
        <span className="mx-auto flex size-12 items-center justify-center rounded-xl border border-[var(--panel-border)] text-muted-foreground">
          <UserX className="size-5" />
        </span>
        <h2 className="mt-4 text-base font-semibold">This account has been disabled</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {email ? <>{email} can no longer use Lighthouse. </> : null}
          If you think this is a mistake, contact an administrator.
        </p>
        {/* A plain form post (/auth/sign-out), not a Server Action: it works from a page opened before a deploy (Nov 2026). */}
        <form action="/auth/sign-out" method="post" onSubmit={forgetPushThenSubmit} className="mt-5">
          <button
            type="submit"
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-[var(--panel-border)] px-3 py-1.5 text-[0.66rem] font-bold uppercase tracking-[0.14em] text-primary transition-colors hover:border-primary/40"
          >
            <LogOut className="size-3.5" /> Sign out
          </button>
        </form>
      </Card>
    </div>
  );
}

/** Signed in, no account to load: one deleted since (its login still good), or a moment the database didn't answer. */
function AccountMissing() {
  return (
    <div className="flex min-h-svh flex-1 items-center justify-center p-6" data-account-missing>
      <Card className="max-w-md p-8 text-center">
        <span className="mx-auto flex size-12 items-center justify-center rounded-xl border border-[var(--panel-border)] text-muted-foreground">
          <UserX className="size-5" />
        </span>
        <h2 className="mt-4 text-base font-semibold">We couldn&apos;t load your account</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The account you&apos;re signed in with may have been removed. Sign out and sign in with your own account; if it keeps happening, contact an
          administrator.
        </p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          {/* A plain form post (/auth/sign-out): it works with no account behind the sign-in. */}
          <form action="/auth/sign-out" method="post" onSubmit={forgetPushThenSubmit}>
            <button type="submit" data-account-missing-sign-out
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-[0.66rem] font-bold uppercase tracking-[0.14em] text-primary-foreground transition-opacity hover:opacity-90">
              <LogOut className="size-3.5" /> Sign out
            </button>
          </form>
          <button type="button" onClick={() => window.location.reload()}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-[var(--panel-border)] px-3 py-1.5 text-[0.66rem] font-bold uppercase tracking-[0.14em] text-primary transition-colors hover:border-primary/40">
            Try again
          </button>
        </div>
      </Card>
    </div>
  );
}

function NoAccess() {
  return (
    <>
      <Topbar title="No access" sub="This page is not part of your workspace" />
      <div className="flex flex-1 items-center justify-center p-6">
        <Card className="max-w-md p-8 text-center">
          <span className="mx-auto flex size-12 items-center justify-center rounded-xl border border-[var(--panel-border)] text-muted-foreground">
            <ShieldOff className="size-5" />
          </span>
          <h2 className="mt-4 text-base font-semibold">You don&apos;t have access to this page</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Your role doesn&apos;t include this area. If you think it should, ask an administrator.
          </p>
          <Link
            href="/"
            className="mt-5 inline-flex items-center rounded-md border border-[var(--panel-border)] px-3 py-1.5 text-[0.66rem] font-bold uppercase tracking-[0.14em] text-primary transition-colors hover:border-primary/40"
          >
            Back to dashboard
          </Link>
        </Card>
      </div>
    </>
  );
}
