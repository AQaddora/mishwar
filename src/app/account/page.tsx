// «حسابي»: who is signed in (name, role, phone) and the sign-out button.
import { redirect } from "next/navigation";
import { Screen } from "@/components/Screen";
import { signOut } from "@/lib/auth";
import { getCurrentUser } from "@/lib/session";

const ROLE_LABEL = { rider: "راكب", driver: "سوّاق" } as const;

async function logOut() {
  "use server";
  await signOut({ redirectTo: "/" });
}

export default async function AccountPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    // Drivers reach this from a link on /driver (it isn't one of their tabs), so give them a way back.
    <Screen title="حسابي" back={user.role === "driver" ? { href: "/driver", label: "اليوم" } : undefined}>
      <dl className="mt-4 divide-y divide-separator rounded-card bg-surface">
        <div className="flex min-h-11 items-center justify-between gap-3 px-4 py-3">
          <dt className="text-text-muted">الاسم</dt>
          <dd className="text-end">{user.name ?? "بدون اسم"}</dd>
        </div>
        <div className="flex min-h-11 items-center justify-between gap-3 px-4 py-3">
          <dt className="text-text-muted">الجوال</dt>
          <dd>{user.phone ? <bdi>{user.phone}</bdi> : "ما في رقم"}</dd>
        </div>
        <div className="flex min-h-11 items-center justify-between gap-3 px-4 py-3">
          <dt className="text-text-muted">إنت</dt>
          <dd>{user.role ? ROLE_LABEL[user.role] : "لسّا ما اخترت"}</dd>
        </div>
      </dl>
      <form action={logOut} className="mt-6">
        <button type="submit" className="min-h-11 w-full rounded-card bg-surface px-4 py-3 text-danger">
          اطلع من حسابك
        </button>
      </form>
    </Screen>
  );
}
