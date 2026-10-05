import type { Metadata } from "next";
import Link from "next/link";

import { InfoPage, InfoSection } from "@/components/info-page";
import { APP_NAME } from "@/lib/brand";
import {
  CONTACT_EMAIL,
  DELETION_GRACE_PERIOD_DAYS,
  DELETION_UPDATED,
  PROVIDER_BACKUP_HOURS,
  RECENT_SIGN_IN_MINUTES,
} from "@/lib/info/legal";

export const metadata: Metadata = {
  title: `Account Deletion · ${APP_NAME}`,
  description: `How to delete your ${APP_NAME} account and data, and what happens when you do.`,
};

const mail = (
  <a className="literal-text" href={`mailto:${CONTACT_EMAIL}`}>
    {CONTACT_EMAIL}
  </a>
);

export default function AccountDeletionPage() {
  return (
    <InfoPage
      page="account-deletion"
      updated={DELETION_UPDATED}
      intro={
        <p>
          You can delete your {APP_NAME} account and everything in it at any
          time, from inside the app. You get {DELETION_GRACE_PERIOD_DAYS} days
          to change your mind.
        </p>
      }
    >
      <InfoSection title="How to delete your account">
        <ol>
          <li>Sign in and open the Profile tab.</li>
          <li>
            Press <b>Settings</b> at the bottom of your Profile card, then{" "}
            <b>Delete My Account</b>.
          </li>
          <li>Read the summary and confirm.</li>
        </ol>
        <p>
          For your safety this only works within {RECENT_SIGN_IN_MINUTES} minutes
          of signing in. If it has been longer, the app offers to email you a
          fresh sign-in link; open it on the same phone and try again.
        </p>
      </InfoSection>

      <InfoSection title="What happens straight away">
        <ul>
          <li>Your players, games and standings are locked and hidden.</li>
          <li>You are signed out on every device.</li>
          <li>The game in progress on that phone is cleared.</li>
          <li>
            Friends no longer see you among their friends, and your pending
            friend requests disappear.
          </li>
          <li>Any live standings link you shared stops working.</li>
        </ul>
      </InfoSection>

      <InfoSection title={`${DELETION_GRACE_PERIOD_DAYS} days to change your mind`}>
        <p>
          Sign in again with the same email within {DELETION_GRACE_PERIOD_DAYS}{" "}
          days and press <b>Recover my account</b>. Everything comes back exactly
          as it was. The screen shows the exact date and time deletion becomes
          permanent.
        </p>
      </InfoSection>

      <InfoSection title="What is deleted for good">
        <p>
          After {DELETION_GRACE_PERIOD_DAYS} days, a daily clean-up permanently
          deletes (within a day of the deadline, never before):
        </p>
        <ul>
          <li>your sign-in identity and email address;</li>
          <li>your name, avatar, user code and currency;</li>
          <li>every player, game, result, buy-in and record in your ledger;</li>
          <li>your friend requests and friendships.</li>
        </ul>
        <p>
          Our database provider keeps short-term recovery copies for up to{" "}
          {PROVIDER_BACKUP_HOURS} hours, after which they are gone too. Nothing
          can be recovered after that. Signing in again with the same email
          starts a brand-new, empty account.
        </p>
      </InfoSection>

      <InfoSection title="What is kept">
        <p>
          Friends keep the players and games in their own ledgers, because those
          are their records of games they hosted. They are no longer linked to
          your account. To have your name changed in a friend&apos;s ledger, ask
          them to rename or remove you.
        </p>
      </InfoSection>

      <InfoSection title="Deleting some data, not your account">
        <ul>
          <li>
            <b>A guest:</b> on Profile, ⋯ → Remove player. Players who never
            played in a saved game can then be deleted permanently.
          </li>
          <li>
            <b>A game:</b> games in the Discarded list on the Games tab can be
            deleted permanently there. To remove any other saved game, email us.
          </li>
          <li>
            <b>A friendship:</b> ⋯ → Unfriend on their row.
          </li>
        </ul>
      </InfoSection>

      <InfoSection title="Can't sign in?">
        <p>
          Email {mail} from the address you sign in with and ask us to delete
          your account. We will confirm it is you, then delete it the same way.
          If you were added as a guest by a host and want your name removed, ask
          the host, or email us and we will help.
        </p>
        <p>
          More about what we keep is in the{" "}
          <Link href="/privacy">Privacy Policy</Link>.
        </p>
      </InfoSection>
    </InfoPage>
  );
}
