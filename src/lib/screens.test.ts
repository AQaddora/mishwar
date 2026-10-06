import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { SCREENS } from "@/lib/screens";

// Every screen the QA runner photographs must also be kept on the phone for offline use,
// or a tab opens with "this page is not on your phone" with no network (Ahmed, 2026-10-06).
const lines = fs
  .readFileSync("qa/routes.txt", "utf8")
  .split("\n")
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith("#"))
  .map((l) => l.split(/\s+/) as [string, string]);

describe("offline screens", () => {
  it("keeps every fixed screen of qa/routes.txt for its role", () => {
    const missing: string[] = [];
    for (const [role, route] of lines) {
      const path = route.split("?")[0];
      // Screens of one record (an id in the path) come from the phone's data: ownScreens.
      if (/[0-9a-f]{8}-[0-9a-f]{4}-/.test(path)) continue;
      if (role === "guest" && ["/welcome"].includes(path)) continue; // only right after sign-in
      if (!SCREENS[role as keyof typeof SCREENS].includes(path)) missing.push(`${role} ${path}`);
    }
    expect(missing).toEqual([]);
  });

  it("never asks to keep an API answer", () => {
    for (const list of Object.values(SCREENS)) expect(list.filter((p) => p.startsWith("/api/"))).toEqual([]);
  });
});
