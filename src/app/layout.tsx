import type { Metadata, Viewport } from "next";
import { Tajawal } from "next/font/google";
import type { ReactNode } from "react";
import { OfflineBanner } from "@/components/OfflineBanner";
import { OutboxProvider } from "@/components/OutboxStatus";
import { ServiceWorker } from "@/components/ServiceWorker";
import { TabBar, type TabRole } from "@/components/TabBar";
import { getCurrentUser } from "@/lib/session";
import "./globals.css";

// Self-hosted at build time: the files ship from our origin, so they work offline.
// Tajawal has no 600; use font-medium (500) or font-bold (700).
const tajawal = Tajawal({
  weight: ["400", "500", "700"],
  subsets: ["arabic", "latin"],
  display: "swap",
  variable: "--font-tajawal",
});

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
    <html lang="ar" dir="rtl" className={tajawal.variable}>
      <body>
        <OfflineBanner />
        <OutboxProvider accountId={user?.id ?? null}>{children}</OutboxProvider>
        <TabBar role={role} />
        {/* The commit (set by the server at run time) tells the worker when its kept screens are from an older build. */}
        <ServiceWorker build={process.env.GIT_REV ?? "dev"} role={role} accountId={user?.id ?? null} />
      </body>
    </html>
  );
}
