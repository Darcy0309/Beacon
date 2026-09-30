import WorkspaceShell from "@/components/layout/workspace-shell";
import { SidebarProvider } from "@/components/layout/sidebar-provider";

/** Every signed-in page: the sidebar, top bar and access checks around it. */
export default function WorkspaceLayout({ children }) {
  return (
    <SidebarProvider>
      <WorkspaceShell>{children}</WorkspaceShell>
    </SidebarProvider>
  );
}
