import { redirect } from "next/navigation";
import { EmptyState, Screen } from "@/components/Screen";
import { getCurrentUser } from "@/lib/session";

export default async function RequestsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.role) redirect("/welcome");
  if (user.role === "driver") redirect("/driver/requests");

  return (
    <Screen title="طلب خاص">
      <EmptyState>لسّا ما بعتت أي طلب خاص.</EmptyState>
    </Screen>
  );
}
