/**
 * Turns Content Security Policy violation reports into short, privacy-safe
 * log entries (app/csp-report/route.ts). Browsers send either the older
 * `report-uri` form ({"csp-report": {...}}) or a Reporting API batch
 * ([{type: "csp-violation", body: {...}}]); both are read here.
 *
 * Page and script addresses lose their query string and fragment, and share
 * and invite tokens in the path are replaced, so no link that grants access
 * ever reaches the logs. Script samples are dropped: they can contain data.
 */
import { redactTokenPath } from "./token-paths.ts";

export type CspViolation = {
  page: string;
  directive: string;
  blocked: string;
  source: string | null;
  line: number | null;
  column: number | null;
  disposition: string;
};

/** Reports kept from one request; a batch beyond this is cut. */
export const MAX_REPORTS_PER_REQUEST = 20;

const MAX_FIELD_LENGTH = 200;

/** Values that name a kind of content rather than an address. */
const KEYWORDS = new Set([
  "inline",
  "eval",
  "wasm-eval",
  "trusted-types-policy",
  "trusted-types-sink",
  "data",
  "blob",
  "self",
]);

function text(value: unknown) {
  return typeof value === "string" ? value.slice(0, MAX_FIELD_LENGTH) : "";
}

function position(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : null;
}

/** An address without query, fragment or tokens; keywords stay as they are. */
export function redactAddress(value: unknown) {
  const address = text(value);
  if (!address) return "";
  if (KEYWORDS.has(address)) return address;
  try {
    const url = new URL(address);
    if (url.protocol === "data:" || url.protocol === "blob:") {
      return url.protocol.slice(0, -1);
    }
    // Browser extensions and other addresses without a web origin.
    if (url.origin === "null") return url.protocol.slice(0, -1);
    return `${url.origin}${redactTokenPath(url.pathname)}`;
  } catch {
    return "other";
  }
}

function violation(fields: {
  page: unknown;
  directive: unknown;
  blocked: unknown;
  source: unknown;
  line: unknown;
  column: unknown;
  disposition: unknown;
}): CspViolation {
  return {
    page: redactAddress(fields.page),
    directive: text(fields.directive),
    blocked: redactAddress(fields.blocked),
    source: redactAddress(fields.source) || null,
    line: position(fields.line),
    column: position(fields.column),
    disposition: text(fields.disposition) || "report",
  };
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

const EXTENSION = /^(?:chrome|moz|safari|safari-web|ms-browser)-extension$/;

/**
 * A violation as a Sentry warning, so reports are kept for 30 days and can
 * be reviewed before the policy is enforced (Vercel Hobby keeps logs for a
 * day). One issue per directive and blocked address. Browser extensions
 * injecting into the page are left out: they say nothing about the app.
 */
export function cspSentryReport(violation: CspViolation) {
  if (EXTENSION.test(violation.blocked) || EXTENSION.test(violation.source ?? "")) {
    return null;
  }
  const blocked = violation.blocked || "unknown";
  const verb = violation.disposition === "enforce" ? "blocked" : "would block";
  return {
    message: `CSP ${verb} ${violation.directive}: ${blocked}`,
    fingerprint: ["csp", violation.directive, blocked],
  };
}

/** Sentry warnings one server instance sends for CSP reports, per hour. */
export const CSP_SENTRY_REPORTS_PER_HOUR = 20;

/** Allows `limit` takes per hour, so a flood of reports can't use up Sentry's quota. */
export function hourlyBudget(limit: number, now: () => number = Date.now) {
  let windowStart = now();
  let used = 0;
  return {
    take() {
      if (now() - windowStart >= 60 * 60 * 1000) {
        windowStart = now();
        used = 0;
      }
      if (used >= limit) return false;
      used += 1;
      return true;
    },
  };
}

/** The violations in a report body; anything unrecognised is skipped. */
export function readCspReports(body: unknown): CspViolation[] {
  const legacy = record(record(body)?.["csp-report"]);
  if (legacy) {
    return [
      violation({
        page: legacy["document-uri"],
        directive: legacy["effective-directive"] ?? legacy["violated-directive"],
        blocked: legacy["blocked-uri"],
        source: legacy["source-file"],
        line: legacy["line-number"],
        column: legacy["column-number"],
        disposition: legacy.disposition,
      }),
    ];
  }

  if (!Array.isArray(body)) return [];
  return body
    .slice(0, MAX_REPORTS_PER_REQUEST)
    .flatMap((report) => {
      const entry = record(report);
      const details = record(entry?.body);
      if (entry?.type !== "csp-violation" || !details) return [];
      return [
        violation({
          page: details.documentURL ?? entry.url,
          directive: details.effectiveDirective,
          blocked: details.blockedURL,
          source: details.sourceFile,
          line: details.lineNumber,
          column: details.columnNumber,
          disposition: details.disposition,
        }),
      ];
    });
}
