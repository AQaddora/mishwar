import { Screen } from "@/components/Screen";
import { getCurrentUser } from "@/lib/session";
import { DriverRequestsClient } from "./DriverRequestsClient";

// «الطلبات». /driver/requests?offer=<request id> opens the offer sheet for that request.
export default async function DriverRequestsPage({ searchParams }: { searchParams: Promise<{ offer?: string }> }) {
  const user = await getCurrentUser();
  if (user?.role !== "driver") return null;
  const params = await searchParams;
  return (
    <Screen title="الطلبات">
      <DriverRequestsClient driverId={user.id} openOffer={typeof params.offer === "string" ? params.offer : null} />
    </Screen>
  );
}
