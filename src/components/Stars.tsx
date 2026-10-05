import { formatNumber } from "@/lib/time";

// Five stars, read-only. The first star is at the start of the line, so in Arabic it
// fills from the right. Screen readers get the number instead of five glyphs.
export function Stars({ value, className = "" }: { value: number; className?: string }) {
  return (
    <span role="img" aria-label={`${formatNumber(value)} من ${formatNumber(5)}`} className={`inline-flex gap-0.5 ${className}`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} aria-hidden="true" className={n <= value ? "text-accent" : "text-separator"}>
          ★
        </span>
      ))}
    </span>
  );
}
