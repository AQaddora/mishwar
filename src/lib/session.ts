import { auth } from "@/lib/auth";
import type { Role } from "@/lib/role";

export type CurrentUser = {
  id: string;
  name: string | null;
  phone: string | null;
  role: Role | null;
};

// The signed-in user, or null for a guest. Never throws for a guest.
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await auth();
  const user = session?.user;
  if (!user?.id) return null;
  return { id: user.id, name: user.name ?? null, phone: user.phone ?? null, role: user.role ?? null };
}
