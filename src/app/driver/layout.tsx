import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getCurrentUser } from "@/lib/session";

// Driver screens are for drivers only. A guest or rider goes home (a user with no role is
// then sent on to /welcome). Pages that later read driver data must check again themselves.
export default async function DriverLayout({ children }: Readonly<{ children: ReactNode }>) {
  const user = await getCurrentUser();
  if (user?.role !== "driver") redirect("/");
  return children;
}
