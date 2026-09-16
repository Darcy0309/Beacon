import "./globals.css";
import { Inter } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import AppShell from "@/components/app-shell";
import Backdrop from "@/components/backdrop";
import { RoleProvider } from "@/components/role-provider";
import { SidebarProvider } from "@/components/sidebar-provider";
import { getCurrentUser } from "@/lib/queries";
import { isSupabaseConfigured } from "@/lib/supabase/config";

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata = {
  title: "Beacon — Lead Management Platform",
  description: "Lead generation and appointment-setting CRM for Signature Marketing.",
};

export default async function RootLayout({ children }) {
  // Null on the login page and for signed-out visitors.
  let user = null;
  if (isSupabaseConfigured) {
    try {
      user = await getCurrentUser();
    } catch {
      user = null;
    }
  }

  return (
    <html lang="en" suppressHydrationWarning className={inter.variable}>
      <body className="antialiased">
        <Backdrop />
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
          <RoleProvider user={user}>
            <SidebarProvider>
              <AppShell>{children}</AppShell>
              <Toaster />
            </SidebarProvider>
          </RoleProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
