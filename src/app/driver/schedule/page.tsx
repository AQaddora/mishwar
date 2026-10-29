// «أيام وساعات الشغل»: the weekly schedule, one row per day, Saturday first.
import Link from "next/link";
import { EmptyState, Screen } from "@/components/Screen";
import type { ScheduleDayInput } from "@/lib/driver-rules";
import { getCurrentUser } from "@/lib/session";
import { gazaNow, WEEK_ORDER } from "@/lib/time";
import { getDriverSetup } from "@/server/driver";
import { ScheduleForm } from "./ScheduleForm";

export default async function DriverSchedulePage() {
  const user = await getCurrentUser();
  if (user?.role !== "driver") return null;
  const { routes, schedule } = await getDriverSetup(user.id);

  // Always seven rows, Saturday first. A day with no row yet starts as a day off.
  const days: ScheduleDayInput[] = WEEK_ORDER.map(
    (weekday) =>
      schedule.find((d) => d.weekday === weekday) ?? {
        weekday,
        working: false,
        startTime: "06:00",
        endTime: "16:00",
        routeId: null,
      },
  );

  return (
    <Screen title="أيام وساعات الشغل" back={{ href: "/driver", label: "اليوم" }}>
      {routes.length === 0 ? (
        <>
          <EmptyState>ضيف خطك أول، وبعدين حدّد أيام شغلك.</EmptyState>
          <Link
            href="/driver/routes/new"
            className="mt-4 flex min-h-11 items-center justify-center rounded-control bg-accent px-4 py-3 font-bold text-on-accent"
          >
            خط جديد
          </Link>
        </>
      ) : (
        <ScheduleForm
          days={days}
          routes={routes.map((r) => ({ id: r.id, name: r.name, isDefault: r.isDefault }))}
          today={gazaNow().weekday}
        />
      )}
    </Screen>
  );
}
