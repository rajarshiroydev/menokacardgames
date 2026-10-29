import { redactTokenPath } from "../security/token-paths.ts";

/**
 * Cleans error reports before they leave for Sentry (pre-launch audit step
 * 6; privacy page "Sentry"). Reports never carry emails, cookies, request
 * bodies, query strings, stack-frame variables or the tokens in live and
 * invite links. The SDK is also told to collect none of these
 * (`DATA_COLLECTION` in sentry-options.ts); this is the second line.
 */

const EMAIL = /[^\s@"'<>()]+@[^\s@"'<>()]+\.[A-Za-z]{2,}/g;
const URL_IN_TEXT = /https?:\/\/[^\s"'<>)]+/g;
// A relative address in text, like "/api/sessions?tz=…", keeps only its path.
const PATH_QUERY_IN_TEXT = /(^|[\s"'(=])(\/[^\s"'<>?#()]*)[?#][^\s"'<>)]*/g;
const TOKEN_PATH_IN_TEXT = /\/(api\/live|live|join)\/[A-Za-z0-9_-]{20,}/g;

/** An address without query, fragment or access tokens. */
export function scrubAddress(value: string) {
  const relative = value.startsWith("/");
  try {
    const url = new URL(value, "http://relative.invalid");
    const path = redactTokenPath(url.pathname);
    return relative ? path : `${url.origin}${path}`;
  } catch {
    return "[address removed]";
  }
}

/** Text with emails, link tokens and query strings taken out. */
export function scrubText(value: string) {
  return value
    .replace(URL_IN_TEXT, (url) => scrubAddress(url))
    .replace(PATH_QUERY_IN_TEXT, "$1$2")
    .replace(TOKEN_PATH_IN_TEXT, "/$1/[token]")
    .replace(EMAIL, "[email]");
}

function scrubValue(value: unknown, depth: number): unknown {
  if (typeof value === "string") return scrubText(value);
  if (depth > 12 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((item) => scrubValue(item, depth + 1));
  const copy: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    // A stack frame's local variables can hold anything: names, games.
    if (key === "vars") continue;
    copy[key] = scrubValue(item, depth + 1);
  }
  return copy;
}

type ReportRequest = {
  url?: string;
  method?: string;
  headers?: Record<string, string>;
};

/**
 * The report as it may leave: the request keeps only its scrubbed address,
 * method and browser; there is no user; every string is scrubbed.
 */
export function scrubEvent<
  Event extends { request?: ReportRequest; user?: unknown },
>(event: Event): Event {
  const cleaned = scrubValue(event, 0) as Event;
  if (cleaned.request) {
    const { url, method, headers } = cleaned.request;
    const userAgent = headers?.["User-Agent"] ?? headers?.["user-agent"];
    // Cookies, the body and the query string are dropped, not just scrubbed.
    cleaned.request = {
      ...(url ? { url: scrubAddress(url) } : {}),
      ...(method ? { method } : {}),
      ...(userAgent ? { headers: { "User-Agent": userAgent } } : {}),
    } as Event["request"];
  }
  delete cleaned.user;
  return cleaned;
}

/** The address Sentry's browser reporting sends to, for the CSP, or null. */
export function sentryIngestOrigin(dsn: string | undefined) {
  if (!dsn) return null;
  try {
    const url = new URL(dsn);
    return url.protocol === "https:" ? url.origin : null;
  } catch {
    return null;
  }
}
