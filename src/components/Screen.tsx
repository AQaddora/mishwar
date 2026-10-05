import Link from "next/link";
import type { ReactNode } from "react";
import { BackChevron } from "@/components/icons";

// A tab screen: optional back link, a 34px large title, then the content. Padded for the
// notch on top and for the tab bar at the bottom.
export function Screen({
  title,
  back,
  action,
  children,
}: {
  title: string;
  back?: { href: string; label: string };
  action?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <main className="px-4 pt-safe pb-tab-bar">
      {back && <BackLink href={back.href} label={back.label} />}
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-large-title">{title}</h1>
        {action}
      </div>
      {children}
    </main>
  );
}

export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="-ms-2 inline-flex min-h-11 items-center gap-1 pe-2 text-accent">
      <BackChevron />
      <span>{label}</span>
    </Link>
  );
}

// The calm line a screen shows until a later milestone fills it. Text only, no fake controls.
export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="mt-2 text-text-muted">{children}</p>;
}
