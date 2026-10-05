import Link from "next/link";
import { PersonIcon } from "@/components/icons";
import { EmptyState, Screen } from "@/components/Screen";

export default function DriverTodayPage() {
  return (
    <Screen
      title="اليوم"
      action={
        // Drivers have no account tab, so the account (and sign-out) lives behind this.
        <Link
          href="/account"
          aria-label="حسابي"
          className="flex size-11 shrink-0 items-center justify-center text-accent"
        >
          <PersonIcon />
        </Link>
      }
    >
      <EmptyState>ما في حجوزات اليوم لسّا.</EmptyState>
    </Screen>
  );
}
