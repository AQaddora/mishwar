import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { ChatClient } from "./ChatClient";

// The chat thread of one offer, for its rider or its driver. Drawn from the phone's own
// copy; the server only sends a thread to the two people in it.
export default async function ChatPage({ params }: { params: Promise<{ offerId: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.role) redirect("/welcome");
  return <ChatClient offerId={(await params).offerId} role={user.role} />;
}
