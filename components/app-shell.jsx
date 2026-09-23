"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShieldOff } from "lucide-react";
import AppSidebar from "@/components/app-sidebar";
import Topbar from "@/components/topbar";
import { Card } from "@/components/ui/card";
import { useRole } from "@/components/role-provider";
import { rolesForPath } from "@/lib/nav";

export default function AppShell({ children }) {
  const path = usePathname();
  const { role } = useRole();

  // Login is a standalone full-screen screen — no sidebar.
  if (path === "/login" || path === "/setup") return children;

  // A page this role cannot open — reached by typing the URL or following an
  // old link. Row Level Security already keeps the data out of reach; this
  // just says so plainly instead of rendering an empty screen.
  const allowed = rolesForPath(path);
  const denied = allowed && !allowed.includes(role);

  return (
    <div className="flex min-h-svh">
      <AppSidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-x-clip">
        {denied ? <NoAccess /> : children}
      </div>
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
