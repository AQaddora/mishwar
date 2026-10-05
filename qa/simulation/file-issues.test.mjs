import { describe, expect, it } from "vitest";
import { fingerprint, issueBody, marker, summarise } from "./file-issues.mjs";

const step = (error, id = "driving.start-trip") => ({ id, actor: "سوّاق 1", title: "Driver starts a trip", status: "fail", error });

describe("fingerprint", () => {
  it("is the same for the same failure in two runs, whatever the numbers and ids", () => {
    const monday = fingerprint(step("the position in /api/sync is 75s old right after it was sent\n  call log: 1"));
    const tuesday = fingerprint(step("the position in /api/sync is 240s old right after it was sent\n  call log: 2"));
    expect(monday).toBe(tuesday);
    expect(fingerprint(step("GET /api/routes/3f2a9c1e77aa4b10 answered 500"))).toBe(fingerprint(step("GET /api/routes/00ffaa1299bc4d11 answered 502")));
  });

  it("differs for another error or another step", () => {
    expect(fingerprint(step("page error: x is not a function"))).not.toBe(fingerprint(step("the page is 40px wider than the phone screen")));
    expect(fingerprint(step("boom", "driving.start-trip"))).not.toBe(fingerprint(step("boom", "offline.rider-home")));
  });

  it("is twelve hex characters and round-trips through the issue marker", () => {
    const fp = fingerprint(step("boom"));
    expect(fp).toMatch(/^[0-9a-f]{12}$/);
    expect(/<!-- fleet-qa-fp:([0-9a-f]+) step:(\S+) -->/.exec(marker(fp, "driving.start-trip"))?.slice(1)).toEqual([fp, "driving.start-trip"]);
  });
});

describe("summarise", () => {
  it("fails a step if it failed for anyone, and passes it only if it passed for everyone", () => {
    const { failed, passed } = summarise([
      { id: "a.one", status: "pass" },
      { id: "a.one", status: "fail", error: "second driver" },
      { id: "a.two", status: "pass" },
      { id: "a.two", status: "pass" },
      { id: "a.three", status: "skip" },
    ]);
    expect(failed.map((s) => s.id)).toEqual(["a.one"]);
    expect([...passed]).toEqual(["a.two"]);
  });
});

describe("issueBody", () => {
  it("carries the marker, the steps, the expectation and the command that checks the fix", () => {
    const body = issueBody({ ...step("boom"), repro: ["Open «أنا سايق»", "Tap «ابدأ الرحلة»"], expected: "Riders see the vehicle." }, "abc123abc123", { commit: "0123456789abcdef", base: "https://example.test", viewport: { name: "iphone", width: 375, height: 812 } }, "");
    expect(body).toContain("<!-- fleet-qa-fp:abc123abc123 step:driving.start-trip -->");
    expect(body).toContain("1. Open «أنا سايق»");
    expect(body).toContain("Riders see the vehicle.");
    expect(body).toContain("npm run sim -- --only driving");
    expect(body).toContain("`01234567`");
  });
});
