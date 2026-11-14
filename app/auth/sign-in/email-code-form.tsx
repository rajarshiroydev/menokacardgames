"use client";

import { EmailCodeSignIn } from "@/components/email-code-sign-in";
import { invitePath } from "@/lib/friends/invites";

/**
 * The sign-in page's email option: a 6-digit code, then on to the invite the
 * person came from (migration 0030) or Home. A full page load, so the server
 * renders with the new session.
 */
export function EmailCodeForm({ invite }: { invite: string | null }) {
  return (
    <EmailCodeSignIn
      onSignedIn={() => window.location.assign(invite ? invitePath(invite) : "/")}
    />
  );
}
