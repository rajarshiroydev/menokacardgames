import type { Metadata } from "next";
import Link from "next/link";

import { InviteHeading, InviteShell } from "@/components/invite-card";
import { JoinInvite } from "@/components/join-invite";
import { provisionHostAccount } from "@/lib/accounts/server";
import { getHostSession } from "@/lib/auth/server";
import { APP_NAME } from "@/lib/brand";
import { inviteTokenHashHex } from "@/lib/friends/invite-token";
import { isInviteToken } from "@/lib/friends/invites";
import { getDatabase } from "@/lib/poker/database";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: `You're invited · ${APP_NAME}`,
  // The link is the invite, so keep it out of search results and out of the
  // Referer header sent to other sites.
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

type InvitePreview = {
  /** Server only: tells the host their own link apart. */
  hostAccountId: string;
  hostName: string;
  hostAvatar: string;
  guestName: string;
};

/** The invite while it can be used: the host's name and avatar and the guest's name. */
async function readInvite(token: string): Promise<InvitePreview | null> {
  if (!isInviteToken(token)) return null;
  const rows = await getDatabase()`
    SELECT public.guest_invite_preview(decode(${inviteTokenHashHex(token)}, 'hex')) AS result
  `;
  return (rows as Array<{ result: InvitePreview | null }>)[0]?.result ?? null;
}

/**
 * An invite to Pokerize from a host to one of their guests (migration 0030).
 * Anyone with the link sees who invited them and the name they play under;
 * after signing in, saving their name (or tapping Accept invite when they
 * already have one) makes them the host's friend and links the guest, games
 * and all.
 */
export default async function JoinPage(props: PageProps<"/join/[token]">) {
  const { token } = await props.params;
  const invite = await readInvite(token);

  if (!invite) {
    return (
      <InviteShell>
        <h1>This invite has expired or was already used</h1>
        <p className="auth-intro">
          Each invite link can be used once and expires 30 days after
          it&apos;s made. Ask the person who invited you to send a new one.
        </p>
        <Link className="auth-primary invite-link" href="/">
          Open {APP_NAME}
        </Link>
      </InviteShell>
    );
  }

  // A page can't clear a stale sign-in cookie, which the auth library tries
  // after signing out; that visitor is simply signed out here.
  const session = await getHostSession().catch(() => null);
  if (!session) {
    return (
      <InviteShell>
        <InviteHeading invite={invite} />
        <p className="auth-intro">
          Join to see every game you&apos;ve played, with your results and
          standings.
        </p>
        <Link
          className="auth-primary invite-link"
          href={`/auth/sign-in?invite=${encodeURIComponent(token)}`}
        >
          Join {APP_NAME}
        </Link>
      </InviteShell>
    );
  }

  const { account, profile } = await provisionHostAccount(session.user.id);
  if (account.lifecycleState !== "active") {
    return (
      <InviteShell>
        <InviteHeading invite={invite} />
        <p className="auth-intro">
          Your account is locked while it&apos;s being deleted. Recover it
          first, then open this link again.
        </p>
        <Link className="auth-primary invite-link" href="/">
          Open {APP_NAME}
        </Link>
      </InviteShell>
    );
  }
  if (account.id === invite.hostAccountId) {
    return (
      <InviteShell>
        <div className="invite-title">
          <p className="eyebrow">Your invite</p>
          <h1>
            This is your invite for{" "}
            <span className="literal-text">{invite.guestName}</span>
          </h1>
        </div>
        <p className="auth-intro">
          Share it with <span className="literal-text">{invite.guestName}</span>{" "}
          so they can join. When they open it and confirm it&apos;s them, you
          become friends and their games move to their account.
        </p>
        <Link className="auth-primary invite-link" href="/">
          Open {APP_NAME}
        </Link>
      </InviteShell>
    );
  }
  return (
    <JoinInvite
      token={token}
      invite={{
        hostName: invite.hostName,
        hostAvatar: invite.hostAvatar,
        guestName: invite.guestName,
      }}
      needsName={!profile.displayName}
      initialAvatar={profile.avatar}
    />
  );
}
