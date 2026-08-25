"use client";

import { usePathname } from "next/navigation";
import AppSidebar from "@/components/app-sidebar";

export default function AppShell({ children }) {
  const path = usePathname();

  // Login is a standalone full-screen screen — no sidebar.
  if (path === "/login") return children;

  return (
    <div className="flex min-h-svh">
      <AppSidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-x-clip">{children}</div>
    </div>
  );
}
