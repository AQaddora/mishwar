import { notFound } from "next/navigation";
import { Screen } from "@/components/Screen";
import { pickerPlaces } from "@/lib/places";
import { getCurrentUser } from "@/lib/session";
import { getDriverSetup } from "@/server/driver";
import { RouteEditor } from "../RouteEditor";

export default async function EditRoutePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (user?.role !== "driver") return null;
  const [{ id }, { routes }] = await Promise.all([params, getDriverSetup(user.id)]);
  const route = routes.find((r) => r.id === id);
  if (!route) notFound();
  const places = pickerPlaces();

  return (
    <Screen title={route.name} back={{ href: "/driver/routes", label: "خطوطي" }}>
      <RouteEditor
        key={route.id}
        places={places}
        route={{ id: route.id, name: route.name, isDefault: route.isDefault, stops: route.stops.map((s) => s.placeId) }}
      />
    </Screen>
  );
}
