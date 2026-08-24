import SidebarNav from "@/components/sidebar-nav";

export default function AppSidebar() {
  return (
    <aside className="sticky top-0 hidden h-svh w-60 shrink-0 bg-sidebar text-sidebar-foreground md:block">
      <SidebarNav />
    </aside>
  );
}
