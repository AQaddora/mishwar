import { redirect } from "next/navigation";
import { Screen } from "@/components/Screen";
import { getCurrentUser } from "@/lib/session";
import { TripsClient } from "./TripsClient";

// «رحلاتي». /trips?b=<booking id> opens that booking; /trips?ask=open opens the location
// consent sheet when the driver has asked.
export default async function TripsPage({ searchParams }: { searchParams: Promise<{ b?: string; ask?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.role) redirect("/welcome");
  if (user.role === "driver") redirect("/driver");
  const params = await searchParams;

  return (
    <Screen title="رحلاتي">
      <TripsClient openId={typeof params.b === "string" ? params.b : null} autoAsk={params.ask === "open"} />
    </Screen>
  );
}
