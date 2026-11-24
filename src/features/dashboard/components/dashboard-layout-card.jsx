import { LayoutDashboard } from "lucide-react";
import SectionHeader from "@/components/shared/section-header";
import { Card } from "@/components/ui/card";
import { LayoutEditor } from "@/features/dashboard/components/customize-dashboard";

/**
 * Settings › Dashboard Layout (Sean, Nov 2026: Customize moved off the dashboard into Settings): an administrator's
 * own dashboard, and the default for each kind of dashboard (Administrators, Account Managers, Clients, Agents).
 * `layout`: getMyDashboardLayout().
 */
export default function DashboardLayoutCard({ layout }) {
  return (
    <Card data-dashboard-layout-card>
      <SectionHeader label="Dashboard Layout" icon={LayoutDashboard} />
      <div className="space-y-3 p-5">
        <p className="text-xs text-muted-foreground">
          Show or hide each section of the dashboard, collapse it to its title, move it up or down, and put it across the page or in the left or right
          column. Choose “Layout for” to set the default each kind of dashboard starts from; everyone else customizes their own under My Profile › Preferences.
        </p>
        <LayoutEditor kind={layout.kind} mine={layout.mine} defaults={layout.defaults} />
      </div>
    </Card>
  );
}
