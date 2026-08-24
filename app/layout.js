import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import AppSidebar from "@/components/app-sidebar";

export const metadata = {
  title: "Beacon CRM — Design Preview",
  description: "Modern rebuild concept for the Beacon lead-management platform (Next.js + Supabase).",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <div className="flex min-h-svh">
            <AppSidebar />
            <div className="flex min-w-0 flex-1 flex-col">{children}</div>
          </div>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
