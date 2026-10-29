"use client";
// The bottom tab bar, rendered once in the root layout: two tabs for a guest, four for a
// rider, four for a driver. Padded for the home indicator; the active tab follows the path.

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import {
  CalendarIcon,
  CarIcon,
  HomeIcon,
  InboxIcon,
  PersonIcon,
  RequestIcon,
  RouteIcon,
  TicketIcon,
} from "@/components/icons";

export type TabRole = "guest" | "rider" | "driver";

type Tab = { href: string; label: string; icon: ReactNode; exact?: boolean };

const TABS: Record<TabRole, Tab[]> = {
  guest: [
    { href: "/", label: "الرئيسية", icon: <HomeIcon />, exact: true },
    { href: "/login", label: "حسابي", icon: <PersonIcon /> },
  ],
  rider: [
    { href: "/", label: "الرئيسية", icon: <HomeIcon />, exact: true },
    { href: "/trips", label: "رحلاتي", icon: <TicketIcon /> },
    { href: "/requests", label: "طلب خاص", icon: <RequestIcon /> },
    { href: "/account", label: "حسابي", icon: <PersonIcon /> },
  ],
  driver: [
    { href: "/driver", label: "اليوم", icon: <CalendarIcon />, exact: true },
    { href: "/driver/vehicle", label: "سيارتي", icon: <CarIcon /> },
    { href: "/driver/routes", label: "خطوطي", icon: <RouteIcon /> },
    { href: "/driver/requests", label: "الطلبات", icon: <InboxIcon /> },
  ],
};

// Full-screen flows with no tab bar.
const HIDDEN_ON = ["/login", "/welcome"];

function isActive(pathname: string, tab: Tab) {
  if (tab.exact) return pathname === tab.href;
  return pathname === tab.href || pathname.startsWith(`${tab.href}/`);
}

export function TabBar({ role }: { role: TabRole }) {
  const pathname = usePathname();
  if (HIDDEN_ON.some((path) => pathname === path || pathname.startsWith(`${path}/`))) return null;

  return (
    <nav
      aria-label="الأقسام"
      className="fixed inset-x-0 bottom-0 z-10 h-(--tab-bar-space) border-t border-separator bg-surface pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="flex h-(--tab-bar-height)">
        {TABS[role].map((tab) => {
          const active = isActive(pathname, tab);
          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`flex h-full min-h-11 flex-col items-center justify-center gap-1 text-caption ${
                  active ? "text-accent" : "text-text-muted"
                }`}
              >
                {tab.icon}
                <span className="leading-none">{tab.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
