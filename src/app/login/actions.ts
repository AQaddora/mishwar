"use server";

import { signIn } from "@/lib/auth";

// Sends the user to Google, then back to "/". "/" sends a user with no role yet to /welcome.
export async function signInWithGoogle() {
  await signIn("google", { redirectTo: "/" });
}
