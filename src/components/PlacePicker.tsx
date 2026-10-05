"use client";

import { useMemo, useState } from "react";
import { Sheet } from "@/components/Sheet";
import { KIND_AR, normalizeArabic, type PickPlace } from "@/lib/places";

// A field that opens a sheet with the searchable list of real places (data/gazetteer.json).
export function PlacePicker({
  label,
  places,
  value,
  onChange,
  exclude = [],
}: {
  label: string;
  places: PickPlace[];
  value: string | null;
  onChange: (id: string) => void;
  exclude?: (string | null)[];
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const chosen = useMemo(() => places.find((p) => p.id === value), [places, value]);
  const matches = useMemo(() => {
    const q = normalizeArabic(query);
    return places.filter((p) => !exclude.includes(p.id) && (!q || normalizeArabic(p.nameAr).includes(q))).slice(0, 60);
  }, [places, exclude, query]);
  const close = () => {
    setOpen(false);
    setQuery("");
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex min-h-11 w-full items-center justify-between gap-3 rounded-control border border-separator bg-surface px-3 py-2 text-start"
      >
        <span className="shrink-0 text-text-muted">{label}</span>
        <span className={`min-w-0 truncate ${chosen ? "font-medium" : "text-text-muted"}`}>{chosen?.nameAr ?? "اختار مكان"}</span>
      </button>
      <Sheet open={open} onClose={close} title={label}>
        <div className="sticky top-0 bg-surface p-4">
          <label htmlFor="place-picker-search" className="sr-only">
            دوّر على مكان
          </label>
          <input
            id="place-picker-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="دوّر على مكان"
            className="min-h-11 w-full rounded-control border border-separator bg-surface px-3 py-2 text-body"
          />
        </div>
        <ul className="divide-y divide-separator pb-4">
          {matches.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => {
                  onChange(p.id);
                  close();
                }}
                className="flex min-h-11 w-full items-center justify-between gap-3 px-4 py-3 text-start"
              >
                <span className="min-w-0 truncate">{p.nameAr}</span>
                <span className="shrink-0 text-caption text-text-muted">{KIND_AR[p.kind] ?? ""}</span>
              </button>
            </li>
          ))}
          {matches.length === 0 && <li className="px-4 py-3 text-text-muted">ما لقينا مكان بهالاسم.</li>}
        </ul>
        <p className="px-4 pb-4 text-caption text-text-muted">
          الأماكن من <bdi>© OpenStreetMap contributors</bdi>
        </p>
      </Sheet>
    </>
  );
}
