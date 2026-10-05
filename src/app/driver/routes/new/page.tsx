import { Screen } from "@/components/Screen";
import { pickerPlaces } from "@/lib/places";
import { RouteEditor } from "../RouteEditor";

export default function NewRoutePage() {
  const places = pickerPlaces();
  return (
    <Screen title="خط جديد" back={{ href: "/driver/routes", label: "خطوطي" }}>
      <RouteEditor places={places} />
    </Screen>
  );
}
