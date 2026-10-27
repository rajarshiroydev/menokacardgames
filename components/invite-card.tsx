import { BrandMark } from "@/components/brand-mark";
import { ThemeToggle } from "@/components/theme-toggle";
import { avatarSrc } from "@/lib/avatars";
import { APP_NAME } from "@/lib/brand";

/** What the invite page may show about an invite: names and the host's avatar. */
export type InviteNames = {
  hostName: string;
  hostAvatar: string;
  guestName: string;
};

/** The invite page's card (/join/<token>), with the logo in its corner. */
export function InviteShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="auth-page">
      <ThemeToggle className="page-theme-toggle" />
      <section className="auth-card invite-card">
        <BrandMark className="auth-mark" />
        {children}
      </section>
    </main>
  );
}

/** Who invited you and the name you play under in their games. */
export function InviteHeading({ invite }: { invite: InviteNames }) {
  return (
    <>
      <div className="invite-host">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={avatarSrc(invite.hostAvatar, invite.hostName)} alt="" width={56} height={56} />
        {/* The name sets in capitals like on Home and Profile, on its own line. */}
        <h1>
          <span className="invite-host-name">{invite.hostName}</span>{" "}
          <span className="invite-host-line">invited you to {APP_NAME}</span>
        </h1>
      </div>
      {/* The guest's name sits mid-sentence: names like "Anika S." end in a
          full stop already. */}
      <p className="auth-intro">
        You play as <b className="literal-text">{invite.guestName}</b> in{" "}
        <span className="literal-text">{invite.hostName}</span>&apos;s games.
      </p>
    </>
  );
}
