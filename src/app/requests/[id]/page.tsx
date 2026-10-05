import { redirect } from "next/navigation";
import { Screen } from "@/components/Screen";
import { getCurrentUser } from "@/lib/session";
import { RequestClient } from "./RequestClient";

// One request with its offers side by side. Drawn from the phone's own copy.
export default async function RequestPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ photos?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.role) redirect("/welcome");
  if (user.role === "driver") redirect("/driver/requests");

  return (
    <Screen title="طلبك" back={{ href: "/requests", label: "طلب خاص" }}>
      <RequestClient id={(await params).id} downloadPhotos={(await searchParams).photos === "now"} />
    </Screen>
  );
}
