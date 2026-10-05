import { redirect } from "next/navigation";
import { Screen } from "@/components/Screen";
import { getPlace, pickerPlaces } from "@/lib/places";
import { getCurrentUser } from "@/lib/session";
import { NewRequestForm } from "./NewRequestForm";

// «طلب جديد». /requests/new?from=<place>&to=<place> arrives filled in from the planner's
// "no route" line.
export default async function NewRequestPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.role) redirect("/welcome");
  if (user.role === "driver") redirect("/driver/requests");
  const params = await searchParams;
  const place = (id: unknown) => (typeof id === "string" && getPlace(id) ? id : null);

  return (
    <Screen title="طلب جديد" back={{ href: "/requests", label: "طلب خاص" }}>
      <NewRequestForm places={pickerPlaces()} initialFrom={place(params.from)} initialTo={place(params.to)} />
    </Screen>
  );
}
