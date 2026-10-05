import { redirect } from "next/navigation";
import { Screen } from "@/components/Screen";
import { getCurrentUser } from "@/lib/session";
import { HistoryClient } from "./HistoryClient";

// Finished trips for both roles. /history?rate=booking:<id> or ?rate=private:<id> opens
// the star sheet for that trip.
export default async function HistoryPage({ searchParams }: { searchParams: Promise<{ rate?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.role) redirect("/welcome");
  const params = await searchParams;
  const driver = user.role === "driver";

  return (
    <Screen title={driver ? "رحلات سابقة" : "رحلاتي السابقة"} back={driver ? { href: "/driver", label: "اليوم" } : { href: "/trips", label: "رحلاتي" }}>
      <HistoryClient role={user.role} accountId={user.id} openRate={typeof params.rate === "string" ? params.rate : null} />
    </Screen>
  );
}
