"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { canChooseRole, normalizePhone } from "@/lib/role";
import { getCurrentUser } from "@/lib/session";

export type ChooseRoleState = { error: string } | null;

export async function chooseRole(
  _prevState: ChooseRoleState,
  formData: FormData,
): Promise<ChooseRoleState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  // Already chosen: the role never changes, so just go home.
  if (!canChooseRole(user.role)) redirect(user.role === "driver" ? "/driver" : "/");

  const role = formData.get("role");
  if (role !== "rider" && role !== "driver") return { error: "اختار راكب أو سوّاق" };

  const phone = normalizePhone(String(formData.get("phone") ?? ""));
  if (!phone) return { error: "رقم الجوال مش مزبوط" };

  // `role: null` in the filter means a double submit can never change a chosen role.
  await prisma.user.updateMany({ where: { id: user.id, role: null }, data: { role, phone } });

  const saved = await prisma.user.findUnique({ where: { id: user.id }, select: { role: true } });
  // Re-render the root layout too, so the tab bar switches to the new role's tabs.
  revalidatePath("/", "layout");
  redirect(saved?.role === "driver" ? "/driver" : "/");
}
