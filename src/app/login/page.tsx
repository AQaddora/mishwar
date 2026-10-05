import { redirect } from "next/navigation";
import { BackLink } from "@/components/Screen";
import { googleEnabled } from "@/lib/auth";
import { getCurrentUser } from "@/lib/session";
import { signInWithGoogle } from "./actions";

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect(user.role === "driver" ? "/driver" : user.role ? "/" : "/welcome");

  return (
    <main className="flex min-h-app flex-col px-4 pt-safe pb-safe">
      {/* No tab bar here, and an installed app has no browser back button. */}
      <BackLink href="/" label="الرئيسية" />
      <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
        <h1 className="text-large-title">مِشوار</h1>
        <p className="text-text-muted">لاقي مشوارك، أو لاقي ركّاب لسيارتك.</p>
      </div>
      <form action={signInWithGoogle} className="flex flex-col gap-3">
        <button
          type="submit"
          disabled={!googleEnabled}
          className="min-h-11 w-full rounded-control bg-accent px-4 py-3 font-bold text-on-accent disabled:opacity-40"
        >
          كمّل مع <bdi>Google</bdi>
        </button>
        {!googleEnabled && (
          <p role="status" className="text-center text-caption text-text-muted">
            تسجيل الدخول مش متاح هلأ
          </p>
        )}
      </form>
    </main>
  );
}
