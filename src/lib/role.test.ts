import { describe, expect, it } from "vitest";
import { canChooseRole, normalizePhone } from "./role";

describe("canChooseRole", () => {
  it("allows a choice only while no role is set", () => {
    expect(canChooseRole(null)).toBe(true);
    expect(canChooseRole("rider")).toBe(false);
    expect(canChooseRole("driver")).toBe(false);
  });
});

describe("normalizePhone", () => {
  it.each([
    ["0591234567", "0591234567"],
    ["059 123 4567", "0591234567"],
    ["059-123-4567", "0591234567"],
    [" 0561234567 ", "0561234567"],
    ["+970591234567", "0591234567"],
    ["+970 59 123 4567", "0591234567"],
    ["+972-56-123-4567", "0561234567"],
    ["00970591234567", "0591234567"],
    ["00972 59 123 4567", "0591234567"],
    ["٠٥٩١٢٣٤٥٦٧", "0591234567"],
  ])("accepts %s", (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it.each([
    "",
    "059123456", // 9 digits
    "05912345678", // 11 digits
    "0791234567", // not a mobile
    "591234567", // missing the 0
    "+9700591234567", // 0 kept after the prefix
    "+962591234567", // another country
    "+97059123456", // too short
    "059123456a",
    "(059) 123 4567",
    "05.912.34567",
  ])("rejects %s", (input) => {
    expect(normalizePhone(input)).toBeNull();
  });
});
