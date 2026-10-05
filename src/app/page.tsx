import { redirect } from "next/navigation";
import { Screen } from "@/components/Screen";
import { getCurrentUser } from "@/lib/session";
import { RiderHome } from "./RiderHome";

export default async function Home({ searchParams }: { searchParams: Promise<{ photos?: string }> }) {
  const user = await getCurrentUser();
  if (user && !user.role) redirect("/welcome");
  if (user?.role === "driver") redirect("/driver");

  return (
    <Screen title="مِشوار">
      <RiderHome signedIn={user !== null} downloadPhotos={(await searchParams).photos === "now"} />
    </Screen>
  );
}
