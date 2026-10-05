"use client";

import { useActionState } from "react";
import { chooseRole } from "./actions";

function RoleCard({ value, title, detail }: { value: "rider" | "driver"; title: string; detail: string }) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-card border-2 border-separator bg-surface p-4 has-checked:border-accent">
      <input type="radio" name="role" value={value} required className="size-5 shrink-0 accent-accent" />
      <span className="flex flex-col gap-1">
        <span className="text-title">{title}</span>
        <span className="text-text-muted">{detail}</span>
      </span>
    </label>
  );
}

export function WelcomeForm() {
  const [state, formAction, pending] = useActionState(chooseRole, null);

  return (
    <form action={formAction} className="mt-6 flex flex-col gap-6">
      <fieldset className="flex flex-col gap-3">
        <legend className="sr-only">إنت مين؟</legend>
        <RoleCard value="rider" title="راكب" detail="بدي ألاقي مشوار" />
        <RoleCard value="driver" title="سوّاق" detail="عندي سيارة وخط" />
      </fieldset>

      <div className="flex flex-col gap-2">
        <label htmlFor="phone" className="font-semibold">
          رقم جوالك
        </label>
        <input
          id="phone"
          name="phone"
          type="tel"
          autoComplete="tel"
          inputMode="tel"
          dir="ltr"
          required
          placeholder="05x xxx xxxx"
          aria-describedby="phone-note"
          className="min-h-11 w-full rounded-control border border-separator bg-surface px-3 py-2 text-end text-body"
        />
        <p id="phone-note" className="text-caption text-text-muted">
          السوّاق بيشوف رقمك بس لما تحجز معه
        </p>
      </div>

      <p className="rounded-card bg-surface p-4 font-semibold">ما بتقدر تغيّر اختيارك بعدين</p>

      {state?.error && (
        <p role="alert" className="text-danger">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="min-h-11 w-full rounded-control bg-accent px-4 py-3 font-semibold text-on-accent disabled:opacity-60"
      >
        يلا نبلّش
      </button>
    </form>
  );
}
