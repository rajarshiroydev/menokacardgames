export const CROSS_SITE_REQUEST = "cross-site-request";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** Methods that can change data and therefore need a same-origin check. */
export function isMutatingMethod(method: string) {
  return !SAFE_METHODS.has(method.toUpperCase());
}

function requestHost(headers: Headers) {
  // Vercel and other proxies put the public host in X-Forwarded-Host.
  const forwarded = headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  return (forwarded || headers.get("host") || "").toLowerCase();
}

/**
 * True when the browser says the request came from this app's own pages.
 * Modern browsers send Sec-Fetch-Site on every request; Origin is the
 * fallback for older ones. A request with neither is rejected, because the
 * only intended client for mutations is the app itself.
 */
export function isSameOriginRequest(headers: Headers) {
  const fetchSite = headers.get("sec-fetch-site");
  if (fetchSite) return fetchSite === "same-origin";

  const origin = headers.get("origin");
  if (!origin || origin === "null") return false;

  const host = requestHost(headers);
  if (!host) return false;
  try {
    return new URL(origin).host.toLowerCase() === host;
  } catch {
    return false;
  }
}
