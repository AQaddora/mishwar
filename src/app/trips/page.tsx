import { redirect } from "next/navigation";
import { EmptyState, Screen } from "@/components/Screen";
import { getCurrentUser } from "@/lib/session";

export default async function TripsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.role) redirect("/welcome");
  if (user.role === "driver") redirect("/driver");

  return (
    <Screen title="رحلاتي">
      <EmptyState>لسّا ما حجزت أي مشوار.</EmptyState>
    </Screen>
  );
}
