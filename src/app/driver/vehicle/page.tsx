import { Screen } from "@/components/Screen";
import { getCurrentUser } from "@/lib/session";
import { gazaNow } from "@/lib/time";
import { getDriverSetup } from "@/server/driver";
import { MaintenanceForm, PhotoSection, VehicleForm } from "./VehicleClient";

export default async function DriverVehiclePage({
  searchParams,
}: {
  searchParams: Promise<{ photos?: string }>;
}) {
  const user = await getCurrentUser();
  if (user?.role !== "driver") return null; // the driver layout already redirects
  const [{ vehicle }, { photos }] = await Promise.all([getDriverSetup(user.id), searchParams]);

  return (
    <Screen title="سيارتي">
      <VehicleForm vehicle={vehicle} />
      {vehicle && (
        <>
          <PhotoSection hashes={vehicle.photos} downloadNow={photos === "now"} />
          <MaintenanceForm
            from={vehicle.maintenanceFrom}
            until={vehicle.maintenanceUntil}
            today={gazaNow().day}
          />
        </>
      )}
    </Screen>
  );
}
