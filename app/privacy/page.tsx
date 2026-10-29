import type { Metadata } from "next";
import Link from "next/link";

import { InfoPage, InfoSection } from "@/components/info-page";
import { APP_NAME } from "@/lib/brand";
import {
  CONTACT_EMAIL,
  DATA_LOCATION,
  DELETION_GRACE_PERIOD_DAYS,
  GAME_BACKUP_EXPIRY_DAYS,
  INVITE_EXPIRY_DAYS,
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
            antes, rake, buy-ins, rebuys, chip counts and results, and, for
            each player, how many hands they played and when they joined late
            or cashed out. Games saved from 28 October 2026 also keep their
            action log: each bet, call, fold, buy-in and win, naming players as
            they were called at the table. Only you see a game&apos;s log, not
            your friends.
          </li>
          <li>
            <b>The game in progress:</b> while you play, your phone sends us a
            copy of the game every few seconds (players, chips, bets and the
            action log), so you can carry on from another device if your phone
            dies. It is deleted when you save or discard the game, or{" "}
            {GAME_BACKUP_EXPIRY_DAYS} days after its last change.
          </li>
          <li>
            <b>Friends:</b> the friend requests you send and answer, and who you
            are friends with.
          </li>
          <li>
            <b>Invites:</b> when you invite one of your guests to {APP_NAME},
            which guest, when, and whether the person who opened the link said
            it was them. We store only a scrambled copy of the link, never the
            link itself, and collect no email or phone number for it.
          </li>
          <li>
            <b>Records:</b> a log of important account events, such as asking to
            delete or recover your account and friend changes, so we can explain
            what happened if something goes wrong.
          </li>
          <li>
            <b>Usage counts:</b> how many requests your account made in the last
            minute or few minutes, and how much game data it saved today, so we
            can stop abuse. Only the count for the current period is kept, and
            it is deleted with your account.
          </li>
        </ul>
        <h3>Kept only on your phone</h3>
        <p>
          Your theme, the List or Table choice, the sound setting, when you
          last opened the notification bell and a random ID for your browser
          (so we know which device holds a game in progress) are stored in your
          browser, not on our servers.
        </p>
        <h3>The camera</h3>
        <p>
          When you use Scan Code, the camera picture is read on your phone to
          find the code. Pictures are never uploaded or kept.
        </p>
        <h3>What we don&apos;t collect</h3>
        <p>
          No payment details, no contacts, no location, no photos, no cookies
          for tracking and no advertising trackers.
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
            To run the app: save games, back up the game in progress, work out
            standings, connect friends and show live standings.
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
            <b>People you played with at a friend&apos;s table</b> can send you
            a friend request from that friend&apos;s standings, without your
            code. It shows them only whether you&apos;re already friends or a
            request is waiting.
          </li>
          <li>
            <b>Anyone with an invite link</b> a host made for one of their
            guests sees the host&apos;s name and avatar and the guest&apos;s
            name, until the link is used or {INVITE_EXPIRY_DAYS} days pass.
            Whoever confirms they are that guest becomes the host&apos;s friend
            and gets the guest&apos;s games, so send it only to that person.
          </li>
          <li>
            <b>Your friends</b> see your name and avatar, and standings and
            saved games built only from the games of theirs you played in. In
            those games they see everyone&apos;s result, as at the table, and
            the standings show each player&apos;s invested and net totals
            across them. They never see your email or games they weren&apos;t
            in.
          </li>
          <li>
            <b>Anyone with a live standings link</b> sees the names, avatars and
            chip counts of that one game until the link ends (at the latest{" "}
            {LIVE_VIEW_EXPIRY_HOURS} hours after the host&apos;s last update):
            each player&apos;s actions and position in the hand being played,
            who won the last hand and the biggest pot, and every player&apos;s
            result over recent hands. Share it only with the table.
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
            security and fixing faults. It also counts page visits without
            cookies (page address with private links blanked out, referring
            site, browser, device type and country) so we can see which parts
            of the app get used.
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
          <li>
            The copy of a game in progress until you save or discard it, or{" "}
            {GAME_BACKUP_EXPIRY_DAYS} days after its last change.
          </li>
          <li>
            Invite links work for {INVITE_EXPIRY_DAYS} days or until used; the
            record of an invite stays with your account.
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
