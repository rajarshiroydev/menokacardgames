import type { Metadata } from "next";
import Link from "next/link";

import { InfoPage, InfoSection } from "@/components/info-page";
import { APP_NAME } from "@/lib/brand";
import {
  CONTACT_EMAIL,
  DATA_LOCATION,
  DELETION_GRACE_PERIOD_DAYS,
  LIVE_VIEW_EXPIRY_HOURS,
  MINIMUM_AGE,
  OPERATOR_COUNTRY,
  OPERATOR_NAME,
  PRIVACY_UPDATED,
  PROVIDER_BACKUP_HOURS,
} from "@/lib/info/legal";

export const metadata: Metadata = {
  title: `Privacy Policy · ${APP_NAME}`,
  description: `What ${APP_NAME} keeps about you, why, who can see it and how to delete it.`,
};

const mail = (
  <a className="literal-text" href={`mailto:${CONTACT_EMAIL}`}>
    {CONTACT_EMAIL}
  </a>
);

export default function PrivacyPage() {
  return (
    <InfoPage
      page="privacy"
      updated={PRIVACY_UPDATED}
      intro={
        <p>
          {APP_NAME} is a chip ledger for home poker games. We keep as little
          about you as we can, we never sell it, and we show no ads. This page
          explains, in plain words, what we keep and why.
        </p>
      }
    >
      <InfoSection title="Who we are">
        <p>
          {APP_NAME} is made and run by {OPERATOR_NAME}, an individual developer
          in {OPERATOR_COUNTRY} (&ldquo;we&rdquo;, &ldquo;us&rdquo;). We decide how
          your information is used. For anything about your privacy, email{" "}
          {mail}.
        </p>
      </InfoSection>

      <InfoSection title="What we keep">
        <h3>When you sign in</h3>
        <ul>
          <li>
            <b>Your email address</b>, to send you sign-in links and to know
            which account is yours. There are no passwords.
          </li>
          <li>
            <b>Sign-in records</b> kept by our sign-in provider to keep you
            signed in and spot misuse. These can include when you signed in,
            your IP address and the type of browser or phone you used.
          </li>
        </ul>
        <h3>What you add</h3>
        <ul>
          <li>
            <b>Your profile:</b> the name you choose, your avatar (one of our
            drawings, never a photo), your user code and your currency.
          </li>
          <li>
            <b>Your players:</b> the names and avatars of the guests you add.
          </li>
          <li>
            <b>Your games:</b> game names, dates and times, seats, blinds,
            buy-ins, rebuys, chip counts and results.
          </li>
          <li>
            <b>Friends:</b> the friend requests you send and answer, and who you
            are friends with.
          </li>
          <li>
            <b>Records:</b> a log of important account events, such as asking to
            delete or recover your account and friend changes, so we can explain
            what happened if something goes wrong.
          </li>
        </ul>
        <h3>Kept only on your phone</h3>
        <p>
          The game in progress, your theme, the List or Table choice, the sound
          setting and when you last opened the notification bell are stored in
          your browser, not on our servers. The game in progress reaches us only
          when you save it, or as a live standings snapshot while you share a
          live link.
        </p>
        <h3>The camera</h3>
        <p>
          When you use Scan Code, the camera picture is read on your phone to
          find the code. Pictures are never uploaded or kept.
        </p>
        <h3>What we don&apos;t collect</h3>
        <p>
          No payment details, no contacts, no location, no photos, and no
          advertising or analytics trackers.
        </p>
      </InfoSection>

      <InfoSection title="Guests you add">
        <p>
          A guest is someone you record without an account, usually by first
          name or nickname. Please only add people who are happy to be
          recorded, and only what is needed to tell them apart. A guest can ask
          you to rename or remove them, or email us and we will help.
        </p>
      </InfoSection>

      <InfoSection title="Why we use it">
        <ul>
          <li>To sign you in and keep your ledger private to you.</li>
          <li>
            To run the app: save games, work out standings, connect friends and
            show live standings.
          </li>
          <li>To keep the app secure, prevent abuse and fix problems.</li>
          <li>To answer you when you contact us.</li>
        </ul>
        <p>
          We use your information only to provide {APP_NAME}. We do not sell it,
          rent it, use it for advertising, or use it to train AI models. You give
          your consent by signing up, and you can withdraw it at any time by
          deleting your account.
        </p>
      </InfoSection>

      <InfoSection title="Who can see it">
        <ul>
          <li>
            <b>You.</b> Your players, games and standings are private to your
            account. Other hosts never see them.
          </li>
          <li>
            <b>People with your user code</b> see only your name and avatar,
            never your email.
          </li>
          <li>
            <b>Your friends</b> see your name and avatar, and standings built only
            from the games of theirs you played in. They never see your email or
            other players&apos; money.
          </li>
          <li>
            <b>Anyone with a live standings link</b> sees the names, avatars and
            chip counts of that one game until the link ends (at the latest{" "}
            {LIVE_VIEW_EXPIRY_HOURS} hours after the host&apos;s last update).
            Share it only with the table.
          </li>
          <li>
            <b>Us.</b> We can see account information to run the service, answer
            support requests and keep it secure. Each time we open a person&apos;s
            details, it is recorded.
          </li>
          <li>
            <b>The law.</b> We would share information only if the law requires
            it, for example a valid court order.
          </li>
        </ul>
      </InfoSection>

      <InfoSection title="Services we use">
        <p>
          These companies store or handle information for us, only to provide{" "}
          {APP_NAME}:
        </p>
        <ul>
          <li>
            <b>Neon</b> runs our database and our sign-in system, and sends the
            sign-in emails.
          </li>
          <li>
            <b>Vercel</b> hosts the app and keeps short-lived request logs for
            security and fixing faults.
          </li>
          <li>
            <b>Healthchecks.io</b> watches our daily clean-up job. It receives
            only counts, never names or emails.
          </li>
        </ul>
        <p>
          Our servers are in {DATA_LOCATION}, so your information is stored and
          processed there. It is encrypted on its way between your phone and our
          servers.
        </p>
      </InfoSection>

      <InfoSection title="How long we keep it">
        <ul>
          <li>As long as your account is open.</li>
          <li>
            When you delete your account, it is locked straight away and
            permanently deleted after {DELETION_GRACE_PERIOD_DAYS} days. Our
            database provider&apos;s recovery copies are gone {PROVIDER_BACKUP_HOURS}{" "}
            hours after that. See{" "}
            <Link href="/account-deletion">Account Deletion</Link>.
          </li>
          <li>
            Players and games you delete permanently yourself are deleted
            straight away.
          </li>
          <li>Hosting request logs are kept only for a short time.</li>
        </ul>
        <p>
          Your friends keep the players and games in their own ledgers, because
          those are their records. After your account is deleted they are no
          longer linked to you.
        </p>
      </InfoSection>

      <InfoSection title="Your choices and rights">
        <ul>
          <li>
            <b>See your data:</b> Export Backup on the Games tab downloads your
            saved games. For a copy of everything, email us.
          </li>
          <li>
            <b>Correct it:</b> change your name, avatar and currency on Profile,
            and rename or remove guests.
          </li>
          <li>
            <b>Delete it:</b> remove players, unfriend people, or delete your
            whole account from Settings. To delete particular games, email us.
          </li>
          <li>
            <b>Complain:</b> email {mail}. We aim to reply within 7 days and to
            resolve complaints within 30 days. In {OPERATOR_COUNTRY} you may also
            complain to the Data Protection Board of India; elsewhere, to your
            local data protection authority.
          </li>
        </ul>
        <p>
          We follow India&apos;s Digital Personal Data Protection Act, 2023, and
          give everyone these rights wherever they live.
        </p>
      </InfoSection>

      <InfoSection title="Age">
        <p>
          {APP_NAME} is for people aged {MINIMUM_AGE} or over. We don&apos;t
          knowingly keep information about anyone younger; if you think we do,
          email us and we will delete it.
        </p>
      </InfoSection>

      <InfoSection title="Changes to this policy">
        <p>
          If we change this policy, we will update the date at the top and note
          important changes in <Link href="/whats-new">What&apos;s New</Link>.
          If a change affects how your information is used in a big way, we will
          tell you in the app before it applies.
        </p>
      </InfoSection>

      <InfoSection title="Contact and grievances">
        <p>
          {OPERATOR_NAME} handles privacy questions and grievances. Email {mail}.
        </p>
      </InfoSection>
    </InfoPage>
  );
}
