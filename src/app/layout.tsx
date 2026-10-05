import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { TabBar, type TabRole } from "@/components/TabBar";
import { getCurrentUser } from "@/lib/session";
import "./globals.css";

export const metadata: Metadata = {
  title: "مِشوار",
  applicationName: "مِشوار",
  appleWebApp: {
    capable: true,
    title: "مِشوار",
    statusBarStyle: "default",
  },
};

// Never set maximumScale or userScalable: pinch-zoom must keep working.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F2F2F7" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
};

export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  const user = await getCurrentUser();
  // A signed-in user with no role yet is sent to /welcome by each page; rider tabs until then.
  const role: TabRole = user ? (user.role ?? "rider") : "guest";

  return (
    <html lang="ar" dir="rtl">
      <body>
        {children}
        <TabBar role={role} />
      </body>
    </html>
  );
}
