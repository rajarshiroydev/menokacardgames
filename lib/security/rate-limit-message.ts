export const TOO_MANY_REQUESTS_MESSAGE =
  "Too many requests in a short time. Wait a minute, then try again.";

/**
 * The message to show for a failed API response. A 429 comes from the Vercel
 * Firewall rate limit (or Neon Auth's own limit), whose body is not the app's
 * JSON, so it gets a fixed explanation instead of the generic fallback.
 */
export function apiErrorMessage(
  status: number,
  serverMessage: string | undefined,
  fallback: string,
) {
  if (status === 429) return TOO_MANY_REQUESTS_MESSAGE;
  return serverMessage || fallback;
}
