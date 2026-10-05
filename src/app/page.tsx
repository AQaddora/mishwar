import Link from "next/link";
import { redirect } from "next/navigation";
import { ForwardChevron } from "@/components/icons";
import { Screen } from "@/components/Screen";
import { getCurrentUser } from "@/lib/session";

export default async function Home() {
  const user = await getCurrentUser();
  if (user && !user.role) redirect("/welcome");
  if (user?.role === "driver") redirect("/driver");

  return (
    <Screen title="مِشوار">
      <p className="mt-2 text-text-muted">هون رح تشوف خريطة السيارات الشغّالة هلأ.</p>
      {!user && (
        <Link
          href="/login"
          className="mt-6 flex min-h-11 items-center justify-between gap-3 rounded-card bg-surface p-4"
        >
          <span>سجّل دخولك عشان تحجز</span>
          <span className="text-text-muted">
            <ForwardChevron />
          </span>
        </Link>
      )}
    </Screen>
  );
}
