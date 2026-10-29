// First login only: pick rider or driver and give a phone number. A user who already has
// a role is sent on to their home.
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { WelcomeForm } from "./WelcomeForm";

export default async function WelcomePage() {
  const user = await getCurrentUser();
  if (user?.role) redirect(user.role === "driver" ? "/driver" : "/");
  // Fleet QA photographs this screen signed out; submitting then goes to /login.
  if (!user && process.env.QA_MODE !== "1") redirect("/login");

  return (
    <main className="min-h-app px-4 pt-safe pb-safe">
      <h1 className="text-large-title">أهلاً فيك! إنت مين؟</h1>
      <WelcomeForm />
    </main>
  );
}
