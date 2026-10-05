import type { Metadata } from "next";
import Link from "next/link";

import { InfoPage, InfoSection } from "@/components/info-page";
import { APP_NAME } from "@/lib/brand";
import {
  CONTACT_EMAIL,
  MINIMUM_AGE,
  OPERATOR_COUNTRY,
  OPERATOR_NAME,
  TERMS_UPDATED,
} from "@/lib/info/legal";

export const metadata: Metadata = {
  title: `Terms of Use · ${APP_NAME}`,
  description: `The rules for using ${APP_NAME}, a chip ledger for home poker games.`,
};

export default function TermsPage() {
  return (
    <InfoPage
      page="terms"
      updated={TERMS_UPDATED}
      intro={
        <p>
          By signing in to or using {APP_NAME}, you agree to these terms and to
          our <Link href="/privacy">Privacy Policy</Link>. If you don&apos;t
          agree, please don&apos;t use the app.
        </p>
      }
    >
      <InfoSection title="Who we are">
        <p>
          {APP_NAME} is made and run by {OPERATOR_NAME}, an individual developer
          in {OPERATOR_COUNTRY} (&ldquo;we&rdquo;, &ldquo;us&rdquo;). You can
          reach us at{" "}
          <a className="literal-text" href={`mailto:${CONTACT_EMAIL}`}>
            {CONTACT_EMAIL}
          </a>
          .
        </p>
      </InfoSection>

      <InfoSection title="Who can use it">
        <p>
          You must be {MINIMUM_AGE} or over. Each account is for one person, and
          you are responsible for what happens in it, so keep access to your
          email safe and sign out on shared devices.
        </p>
      </InfoSection>

      <InfoSection title="What Pokerize is, and isn't">
        <ul>
          <li>
            {APP_NAME} is a scorekeeper. It records chips, bets and results for
            poker games you play in person with people you know.
          </li>
          <li>
            It is <b>not</b> a gambling service. You can&apos;t bet, pay, win or
            withdraw money in the app. The currency signs are labels for chips;
            no money is held, moved or settled by us.
          </li>
          <li>
            Any money your group settles is a private arrangement between you.
            We are not part of it and are not responsible for it.
          </li>
          <li>
            Playing poker for money is restricted or illegal in some places. You
            are responsible for following the laws where you play.
          </li>
        </ul>
      </InfoSection>

      <InfoSection title="Numbers and standings">
        <p>
          We work hard to get the numbers right, but the app can have mistakes,
          and it only knows what was entered. Check anything important before
          relying on it. Standings summarise results; they are not a skill
          rating. We are not responsible for disagreements between players about
          results, chips or money.
        </p>
      </InfoSection>

      <InfoSection title="Your content">
        <ul>
          <li>
            What you add (names, players, games) stays yours. You let us store,
            process and show it only as needed to run {APP_NAME} for you and the
            people you share it with.
          </li>
          <li>
            Only add people who are happy to be recorded, and use names or
            nicknames, not sensitive details.
          </li>
          <li>
            Don&apos;t use names that are offensive, hateful or pretend to be
            someone else.
          </li>
          <li>
            Anyone with a live standings link can see that game&apos;s names and
            chips until it ends. Share links with care.
          </li>
        </ul>
      </InfoSection>

      <InfoSection title="Fair use">
        <p>Please don&apos;t:</p>
        <ul>
          <li>try to get into accounts or data that aren&apos;t yours;</li>
          <li>
            overload, attack, scrape or copy the service, or get round its limits
            and security;
          </li>
          <li>use it to break any law or to harm or harass anyone;</li>
          <li>
            use it to run a commercial gambling operation or take money from
            players.
          </li>
        </ul>
        <p>
          We may suspend or close an account that breaks these terms. Where we
          reasonably can, we will tell you why first.
        </p>
      </InfoSection>

      <InfoSection title="The service">
        <p>
          {APP_NAME} is free. We may add, change or remove features, and we may
          stop the service. If we plan to shut it down, we will give at least 30
          days&apos; notice in the app, so you can export your games first
          (Export Backup on the Games tab).
        </p>
      </InfoSection>

      <InfoSection title="Ending your account">
        <p>
          You can delete your account at any time from Settings. How that works,
          including the recovery period, is on{" "}
          <Link href="/account-deletion">Account Deletion</Link>.
        </p>
      </InfoSection>

      <InfoSection title="Our responsibility">
        <p>
          {APP_NAME} is provided &ldquo;as is&rdquo; and &ldquo;as
          available&rdquo;, without promises that it will always work, be free
          of errors or keep every piece of data. As far as the law allows, we
          are not liable for indirect or consequential losses, lost data, or any
          money won, lost or owed between players. Where the law allows a limit,
          our total liability to you is limited to ₹1,000. Nothing in these
          terms limits rights you have by law that can&apos;t be limited.
        </p>
        <p>
          If you misuse {APP_NAME} or break these terms and someone makes a claim
          against us because of it, you agree to cover the reasonable costs that
          result.
        </p>
      </InfoSection>

      <InfoSection title="Law and disputes">
        <p>
          These terms are governed by the laws of {OPERATOR_COUNTRY}. If you have
          a problem, please email us first; most things can be sorted out
          quickly. Any dispute that can&apos;t be settled will be heard by the
          courts of {OPERATOR_COUNTRY}.
        </p>
      </InfoSection>

      <InfoSection title="Changes to these terms">
        <p>
          We may update these terms. We will change the date at the top and note
          important changes in <Link href="/whats-new">What&apos;s New</Link>.
          Using the app after a change means you accept the new terms.
        </p>
      </InfoSection>
    </InfoPage>
  );
}
