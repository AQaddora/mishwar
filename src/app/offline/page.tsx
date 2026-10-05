import Link from "next/link";

// Shown by the service worker when a screen was never opened on this phone and there is
// no network. The worker keeps a copy of this page when it installs.

export default function OfflinePage() {
  return (
    <main className="flex min-h-app flex-col items-center justify-center gap-3 px-4 pt-safe pb-tab-bar text-center">
      <h1 className="text-large-title">ما في نت</h1>
      <p className="text-text-muted">هاي الصفحة لسّا مش محفوظة على جوالك. افتحها مرة والنت شغّال، وبعدها بتفتح معك حتى بدون نت.</p>
      <Link href="/" className="flex min-h-11 items-center rounded-control bg-accent px-6 py-3 font-bold text-on-accent">
        ارجع للرئيسية
      </Link>
    </main>
  );
}
