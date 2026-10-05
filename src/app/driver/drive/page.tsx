import { Screen } from "@/components/Screen";
import { isRunning, NOT_RUNNING_AR } from "@/lib/driver-rules";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { gazaNow } from "@/lib/time";
import { getDriverSetup } from "@/server/driver";
import { DriveClient } from "./DriveClient";

// «أنا سايق»: the only screen that sends the driver's position, and only between
// «ابدأ الرحلة» and «خلّصت الرحلة».
export default async function DrivePage() {
  const user = await getCurrentUser();
  if (user?.role !== "driver") return null;
  const [setup, trip] = await Promise.all([
    getDriverSetup(user.id),
    prisma.trip.findFirst({ where: { driverId: user.id, endedAt: null }, select: { id: true, routeId: true, startedAt: true } }),
  ]);
  const state = isRunning(setup, gazaNow());
  const defaultRoute = setup.routes.find((r) => r.isDefault);
  const nextRoute = state.running ? setup.routes.find((r) => r.id === state.routeId) : defaultRoute;
  // Without a vehicle or a route there is nothing to start; maintenance blocks it too.
  const blocked = !setup.vehicle
    ? NOT_RUNNING_AR.no_vehicle
    : !state.running && state.reason === "maintenance"
      ? NOT_RUNNING_AR.maintenance
      : !nextRoute
        ? NOT_RUNNING_AR.no_route
        : null;

  return (
    <Screen title="أنا سايق" back={{ href: "/driver", label: "اليوم" }}>
      <DriveClient
        trip={trip ? { id: trip.id, routeName: setup.routes.find((r) => r.id === trip.routeId)?.name ?? "", startedAt: trip.startedAt.toISOString() } : null}
        routeName={nextRoute?.name ?? null}
        blocked={blocked}
        outsideSchedule={!state.running && blocked === null}
      />
    </Screen>
  );
}
