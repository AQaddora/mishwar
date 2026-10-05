import { redirect } from "next/navigation";
import { Screen } from "@/components/Screen";
import { getCurrentUser } from "@/lib/session";
import { RequestsClient } from "./RequestsClient";

// «طلب خاص»: the rider's own requests, and the way to post a new one.
export default async function RequestsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.role) redirect("/welcome");
  if (user.role === "driver") redirect("/driver/requests");

  return (
    <Screen title="طلب خاص">
      <RequestsClient />
    </Screen>
  );
}
