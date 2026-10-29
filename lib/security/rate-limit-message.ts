export const TOO_MANY_REQUESTS_MESSAGE =
  "Too many requests in a short time. Wait a minute, then try again.";

/**
 * The message to show for a failed API response. The app's own per-account
 * limits answer 429 with a message saying which limit and how long to wait
 * (lib/security/limits.ts). A 429 from the Vercel Firewall or Neon Auth has
 * no such message, so it gets a fixed explanation instead of the fallback.
 */
export function apiErrorMessage(
  status: number,
  serverMessage: string | undefined,
  fallback: string,
) {
  if (status === 429) return serverMessage || TOO_MANY_REQUESTS_MESSAGE;
  return serverMessage || fallback;
}
