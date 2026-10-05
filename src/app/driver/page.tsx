import Link from "next/link";
import { ForwardChevron, PersonIcon } from "@/components/icons";
import { Screen } from "@/components/Screen";
import { isRunning, NOT_RUNNING_AR } from "@/lib/driver-rules";
import { getCurrentUser } from "@/lib/session";
import { formatTime, gazaNow, WEEKDAY_AR } from "@/lib/time";
import { prisma } from "@/lib/prisma";
import { getDriverSetup } from "@/server/driver";
import { TodayRiders } from "./TodayRiders";

// «اليوم». /driver?loc=<booking id> opens that rider's shared location.
export default async function DriverTodayPage({ searchParams }: { searchParams: Promise<{ loc?: string }> }) {
  const user = await getCurrentUser();
  if (user?.role !== "driver") return null;
  const [setup, openTrip, params] = await Promise.all([
    getDriverSetup(user.id),
    prisma.trip.findFirst({ where: { driverId: user.id, endedAt: null }, select: { id: true } }),
    searchParams,
  ]);
  const now = gazaNow();
  const state = isRunning(setup, now);
  const route = state.running ? setup.routes.find((r) => r.id === state.routeId) : undefined;

  return (
    <Screen
      title="اليوم"
      action={
        // Drivers have no account tab, so the account (and sign-out) lives behind this.
        <Link
          href="/account"
          aria-label="حسابي"
          className="flex size-11 shrink-0 items-center justify-center text-accent"
        >
          <PersonIcon />
        </Link>
      }
    >
      <section className="mt-4 flex flex-col gap-1 rounded-card bg-surface p-4">
        <p className="text-caption text-text-muted">{WEEKDAY_AR[now.weekday]}</p>
        {state.running ? (
          <>
            <p className="text-title text-accent">شغّال هلأ</p>
            <p>{route?.name}</p>
            <p className="text-text-muted">
              من الساعة <bdi>{formatTime(state.startTime)}</bdi> للساعة <bdi>{formatTime(state.endTime)}</bdi>
            </p>
          </>
        ) : (
          <p className="text-title">{NOT_RUNNING_AR[state.reason]}</p>
        )}
      </section>
      <Link
        href="/driver/drive"
        className="mt-4 flex min-h-11 items-center justify-center rounded-control bg-accent px-4 py-3 font-bold text-on-accent"
      >
        أنا سايق
      </Link>
      <Link
        href="/driver/schedule"
        className="mt-4 flex min-h-11 items-center justify-between gap-3 rounded-card bg-surface px-4 py-3"
      >
        <span>أيام وساعات الشغل</span>
        <span className="text-text-muted">
          <ForwardChevron />
        </span>
      </Link>
      <TodayRiders hasOpenTrip={openTrip !== null} canDrive={setup.vehicle !== null && setup.routes.length > 0} openLocation={typeof params.loc === "string" ? params.loc : null} />
    </Screen>
  );
}
