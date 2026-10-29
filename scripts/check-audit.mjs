// Fails when `npm audit` reports a high or critical advisory that isn't a
// reviewed exception in scripts/audit-exceptions.json, or when an exception
// is past its reviewBy date. CI runs it (.github/workflows/ci.yml); run it
// locally with `npm run audit:check`.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const BLOCKING_SEVERITIES = new Set(["high", "critical"]);

/** Advisories in an `npm audit --json` report, keyed by GHSA ID. */
export function advisoriesIn(report) {
  const advisories = new Map();
  for (const [name, vulnerability] of Object.entries(
    report.vulnerabilities ?? {},
  )) {
    for (const via of vulnerability.via ?? []) {
      // A string names another vulnerable package, not an advisory.
      if (typeof via !== "object" || !via.url) continue;
      const id = via.url.split("/").pop();
      const advisory = advisories.get(id) ?? {
        id,
        severity: via.severity,
        title: via.title,
        packages: new Set(),
      };
      advisory.packages.add(name);
      advisories.set(id, advisory);
    }
  }
  return advisories;
}

/**
 * What the check reports: blocking advisories with no exception, exceptions
 * past their review date, and exceptions whose advisory is gone.
 */
export function auditFindings(report, exceptions, today) {
  const advisories = advisoriesIn(report);
  const excepted = new Set(exceptions.map((exception) => exception.advisory));
  return {
    unexcused: [...advisories.values()].filter(
      (advisory) =>
        BLOCKING_SEVERITIES.has(advisory.severity) && !excepted.has(advisory.id),
    ),
    overdue: exceptions.filter((exception) => exception.reviewBy < today),
    resolved: exceptions.filter(
      (exception) => !advisories.has(exception.advisory),
    ),
  };
}

function main() {
  const audit = spawnSync("npm", ["audit", "--json"], { encoding: "utf8" });
  let report;
  try {
    report = JSON.parse(audit.stdout);
  } catch {
    console.error("npm audit did not return JSON:\n", audit.stderr);
    process.exit(1);
  }
  if (report.error) {
    console.error("npm audit failed:", report.error.summary ?? report.error);
    process.exit(1);
  }

  const { exceptions } = JSON.parse(
    readFileSync(new URL("./audit-exceptions.json", import.meta.url), "utf8"),
  );
  const today = new Date().toISOString().slice(0, 10);
  const { unexcused, overdue, resolved } = auditFindings(
    report,
    exceptions,
    today,
  );

  for (const exception of resolved) {
    console.warn(
      `No longer reported, remove the exception: ${exception.advisory} (${exception.package})`,
    );
  }
  for (const advisory of unexcused) {
    console.error(
      `${advisory.severity}: ${advisory.id} in ${[...advisory.packages].join(", ")}: ${advisory.title}`,
    );
  }
  for (const exception of overdue) {
    console.error(
      `Review again (reviewBy ${exception.reviewBy} has passed): ${exception.advisory} (${exception.package})`,
    );
  }
  if (unexcused.length || overdue.length) {
    console.error(
      "\nUpgrade the affected packages, or after review add or renew the entry in scripts/audit-exceptions.json.",
    );
    process.exit(1);
  }
  console.log(
    `npm audit: no unreviewed high or critical advisories (${exceptions.length} reviewed exceptions).`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
