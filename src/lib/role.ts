export type Role = "rider" | "driver";

// The role is chosen once, on /welcome, and never changes.
export function canChooseRole(existing: Role | null): boolean {
  return existing === null;
}

// Palestinian mobile numbers: 05XXXXXXXX, or the same with +970 / +972 / 00970 / 00972
// in front instead of the 0. Spaces and dashes are allowed, and so are Arabic digits
// (an Arabic keyboard types ٠٥٩...). Returns the 05XXXXXXXX form, or null.
export function normalizePhone(input: string): string | null {
  const ascii = input.replace(/[٠-٩۰-۹]/g, (d) => String(d.charCodeAt(0) & 0xf));
  const compact = ascii.replace(/[\s-]/g, "");
  const local = compact.replace(/^(?:\+|00)97[02]/, "0");
  return /^05\d{8}$/.test(local) ? local : null;
}
