import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import AppShell from "@/components/app-shell";
import Backdrop from "@/components/backdrop";
import { RoleProvider } from "@/components/role-provider";

export const metadata = {
  title: "Beacon CRM — Design Preview",
  description: "Modern rebuild concept for the Beacon lead-management platform (Next.js + Supabase).",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased">
        <Backdrop />
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <RoleProvider>
            <AppShell>{children}</AppShell>
            <Toaster />
          </RoleProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
