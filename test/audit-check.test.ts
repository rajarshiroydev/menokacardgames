import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { advisoriesIn, auditFindings } from "../scripts/check-audit.mjs";

function advisory(id: string, severity: string) {
  return {
    url: `https://github.com/advisories/${id}`,
    severity,
    title: `Advisory ${id}`,
  };
}

const report = {
  vulnerabilities: {
    "better-auth": {
      via: [advisory("GHSA-crit", "critical"), "@better-auth/core"],
    },
    zod: { via: [advisory("GHSA-high", "high")] },
    deepmerge: { via: [advisory("GHSA-low", "low")] },
    "@neondatabase/auth": { via: ["better-auth", "zod"] },
  },
};

function exception(advisoryId: string, reviewBy = "2026-12-31") {
  return { advisory: advisoryId, package: "x", reason: "reviewed", reviewBy };
}

describe("npm audit check", () => {
  it("reads advisories, not the packages that only depend on them", () => {
    const advisories = advisoriesIn(report);
    assert.deepEqual([...advisories.keys()].sort(), [
      "GHSA-crit",
      "GHSA-high",
      "GHSA-low",
    ]);
    assert.deepEqual([...advisories.get("GHSA-crit")!.packages], [
      "better-auth",
    ]);
  });

  it("fails on high and critical advisories without an exception", () => {
    const { unexcused } = auditFindings(report, [], "2026-10-29");
    assert.deepEqual(
      unexcused.map((found: { id: string }) => found.id).sort(),
      ["GHSA-crit", "GHSA-high"],
    );
  });

  it("passes reviewed exceptions until their review date", () => {
    const exceptions = [exception("GHSA-crit"), exception("GHSA-high")];
    const current = auditFindings(report, exceptions, "2026-10-29");
    assert.equal(current.unexcused.length, 0);
    assert.equal(current.overdue.length, 0);
    const later = auditFindings(report, exceptions, "2027-01-01");
    assert.equal(later.overdue.length, 2);
  });

  it("notices exceptions whose advisory is gone", () => {
    const { resolved } = auditFindings(
      report,
      [exception("GHSA-crit"), exception("GHSA-fixed")],
      "2026-10-29",
    );
    assert.deepEqual(
      resolved.map((found: { advisory: string }) => found.advisory),
      ["GHSA-fixed"],
    );
  });

  it("gives every exception a reason and a review date", () => {
    const { exceptions } = JSON.parse(
      readFileSync(new URL("../scripts/audit-exceptions.json", import.meta.url), "utf8"),
    );
    assert.ok(exceptions.length > 0);
    for (const entry of exceptions) {
      assert.match(entry.advisory, /^GHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}$/);
      assert.ok(entry.reason.length > 20);
      assert.match(entry.reviewBy, /^\d{4}-\d{2}-\d{2}$/);
    }
  });
});
