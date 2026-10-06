// Which screens the service worker keeps on the phone for each role (offline-first-pwa
// skill), so a tab never opened before still opens with no network.
import type { TabRole } from "@/components/TabBar";
import { readLocal } from "@/lib/sync";

// Every fixed screen of each role. A new screen goes here too (a unit test checks qa/routes.txt).
export const SCREENS: Record<TabRole, string[]> = {
  guest: ["/", "/search", "/login", "/offline"],
  rider: ["/", "/search", "/trips", "/requests", "/requests/new", "/history", "/account", "/offline"],
  driver: [
    "/driver",
    "/driver/drive",
    "/driver/vehicle",
    "/driver/routes",
    "/driver/routes/new",
    "/driver/schedule",
    "/driver/requests",
    "/history",
    "/account",
    "/search",
    "/offline",
  ],
};

/** The screens that exist only for this account's own data: its requests, chats, routes. */
export async function ownScreens(role: TabRole, accountId: string | null): Promise<string[]> {
  if (role === "guest" || !accountId) return [];
  const { data } = await readLocal();
  if (role === "rider") {
    const mine = data.requests.filter((r) => r.mine);
    const ids = new Set(mine.map((r) => r.id));
    return [...mine.map((r) => `/requests/${r.id}`), ...data.offers.filter((o) => ids.has(o.requestId)).map((o) => `/chat/${o.id}`)];
  }
  return [
    ...data.routes.filter((r) => r.driverId === accountId).map((r) => `/driver/routes/${r.id}`),
    ...data.offers.filter((o) => o.driverId === accountId).map((o) => `/chat/${o.id}`),
  ];
}
