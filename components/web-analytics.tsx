"use client";

import { Analytics, type BeforeSendEvent } from "@vercel/analytics/next";

/**
 * Vercel Web Analytics (cookieless page views). URLs are scrubbed before they
 * leave the browser: live standings links carry their access token in the
 * path, and query strings can carry sign-in or invite codes.
 */
function scrubUrl(event: BeforeSendEvent): BeforeSendEvent {
  const url = new URL(event.url);
  url.search = "";
  url.hash = "";
  url.pathname = url.pathname.replace(/^\/live\/[^/]+/, "/live/[token]");
  return { ...event, url: url.toString() };
}

export function WebAnalytics() {
  return <Analytics beforeSend={scrubUrl} />;
}
