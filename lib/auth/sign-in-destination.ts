import { invitePath, isInviteToken } from "../friends/invites.ts";

/** The `next` value that brings a sign-in link back to the admin dashboard. */
export const ADMIN_SIGN_IN_NEXT = "admin";

/**
 * Where a sign-in link leads once it has signed the person in
 * (app/auth/callback): back to the invite it was asked from, to the admin
 * dashboard when it was asked from there, otherwise Home. Only these fixed
 * places, so a crafted link can't send anyone to another site.
 */
export function afterSignInPath(params: URLSearchParams) {
  const invite = params.get("invite");
  if (isInviteToken(invite)) return invitePath(invite);
  if (params.get("next") === ADMIN_SIGN_IN_NEXT) return "/admin";
  return "/";
}
