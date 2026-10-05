import Link from "next/link";
import { ForwardChevron } from "@/components/icons";
import { EmptyState, Screen } from "@/components/Screen";
import { getCurrentUser } from "@/lib/session";
import { formatNumber } from "@/lib/time";
import { getDriverSetup } from "@/server/driver";

const row = "flex min-h-11 items-center justify-between gap-3 px-4 py-3";

export default async function DriverRoutesPage() {
  const user = await getCurrentUser();
  if (user?.role !== "driver") return null;
  const { routes } = await getDriverSetup(user.id);

  return (
    <Screen title="خطوطي">
      {routes.length === 0 ? (
        <EmptyState>لسّا ما ضفت خط. ضيف الخط اللي بتمشيه كل يوم.</EmptyState>
      ) : (
        <ul className="mt-4 divide-y divide-separator rounded-card bg-surface">
          {routes.map((route) => (
            <li key={route.id}>
              <Link href={`/driver/routes/${route.id}`} className={row}>
                <span className="flex min-w-0 flex-col gap-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate font-medium">{route.name}</span>
                    {route.isDefault && (
                      <span className="shrink-0 rounded-full bg-accent px-2 text-caption text-on-accent">الخط الأساسي</span>
                    )}
                  </span>
                  <span className="text-caption text-text-muted">
                    <bdi>{formatNumber(route.stops.length)}</bdi> مواقف، رايح جاي
                  </span>
                </span>
                <span className="shrink-0 text-text-muted">
                  <ForwardChevron />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Link
        href="/driver/routes/new"
        className="mt-4 flex min-h-11 items-center justify-center rounded-control bg-accent px-4 py-3 font-bold text-on-accent"
      >
        خط جديد
      </Link>
      <Link href="/driver/schedule" className={`mt-6 rounded-card bg-surface ${row}`}>
        <span>أيام وساعات الشغل</span>
        <span className="text-text-muted">
          <ForwardChevron />
        </span>
      </Link>
    </Screen>
  );
}
