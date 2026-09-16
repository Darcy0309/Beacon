import "./globals.css";
import { Outfit } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import AppShell from "@/components/app-shell";
import Backdrop from "@/components/backdrop";
import { RoleProvider } from "@/components/role-provider";
import { SidebarProvider } from "@/components/sidebar-provider";
import { getCurrentUser } from "@/lib/queries";

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
  display: "swap",
});

export const metadata = {
  title: "Beacon CRM",
  description: "Lead generation and appointment-setting CRM for Signature Marketing.",
};

export default async function RootLayout({ children }) {
  // Null on the login page and for signed-out visitors.
  let user = null;
  try {
    user = await getCurrentUser();
  } catch {
    user = null;
  }

  return (
    <html lang="en" suppressHydrationWarning className={outfit.variable}>
      <body className={`${outfit.className} antialiased`}>
        <Backdrop />
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
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
