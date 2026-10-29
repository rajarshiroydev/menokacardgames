import * as Sentry from "@sentry/nextjs";

import {
  CSP_SENTRY_REPORTS_PER_HOUR,
  cspSentryReport,
  hourlyBudget,
  readCspReports,
} from "@/lib/security/csp-report";
import { readJsonBody } from "@/lib/security/json-body";

export const dynamic = "force-dynamic";

const sentryBudget = hourlyBudget(CSP_SENTRY_REPORTS_PER_HOUR);

/** One report batch is a few KB; this leaves room and stops floods early. */
const REPORT_BODY_LIMIT = 64 * 1024;

/** Report types browsers use for CSP violations. */
const REPORT_CONTENT_TYPE =
  /^application\/(?:csp-report|reports\+json|json)\b/i;

/**
 * Receives Content Security Policy violation reports from browsers and logs
 * a redacted summary (lib/security/csp-report.ts), one `[csp]` line per
 * request. Each violation also goes to Sentry as a warning, within an hourly
 * budget. Outside /api on purpose: it changes no data, so the API's
 * same-origin check and the firewall's write limit don't apply.
 */
export async function POST(request: Request) {
  const read = await readJsonBody(
    request,
    REPORT_BODY_LIMIT,
    REPORT_CONTENT_TYPE,
  );
  if (read.ok) {
    const violations = readCspReports(read.body);
    if (violations.length) console.warn("[csp]", JSON.stringify(violations));
    for (const violation of violations) {
      const report = cspSentryReport(violation);
      if (!report || !sentryBudget.take()) continue;
      Sentry.captureMessage(report.message, {
        level: "warning",
        fingerprint: report.fingerprint,
        contexts: { csp: violation },
      });
    }
  }
  // Browsers ignore the answer, so a malformed report gets the same reply.
  return new Response(null, {
    status: 204,
    headers: { "Cache-Control": "no-store" },
  });
}
