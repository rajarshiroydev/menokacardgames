"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { signOut } from "@/app/auth/sign-in/actions";
import { APP_NAME } from "@/lib/brand";
import { CHANGELOG } from "@/lib/info/changelog";
import {
  CONTACT_EMAIL,
  DELETION_GRACE_PERIOD_DAYS,
  formatInfoDate,
} from "@/lib/info/legal";
import { FROM_APP_PARAM, INFO_PAGES, type InfoPageId } from "@/lib/info/pages";
import { readTurnSound, storeTurnSound } from "@/lib/poker/storage";

/**
 * Settings, opened from the Profile card: device settings, the info pages
 * and the account actions (user request 2026-10-05).
 */
export function SettingsView({
  email,
  onDeleteAccount,
}: {
  email: string;
  onDeleteAccount: () => void;
}) {
  const latest = CHANGELOG[0];
  return (
    <div className="settings-view">
      <section className="settings-group" aria-labelledby="settings-sounds">
        <h2 id="settings-sounds">Sounds · On This Device</h2>
        <div className="glass settings-card">
          <TurnSoundSetting />
        </div>
      </section>

      <section className="settings-group" aria-labelledby="settings-about">
        <h2 id="settings-about">About {APP_NAME}</h2>
        <div className="glass settings-card">
          <InfoRow page="features" />
          <InfoRow
            page="whats-new"
            note={latest ? `Latest: ${formatInfoDate(latest.date)}` : undefined}
          />
        </div>
      </section>

      <section className="settings-group" aria-labelledby="settings-legal">
        <h2 id="settings-legal">Privacy And Legal</h2>
        <div className="glass settings-card">
          <InfoRow page="privacy" />
          <InfoRow page="terms" />
          <InfoRow page="account-deletion" />
        </div>
      </section>

      <section className="settings-group" aria-labelledby="settings-account">
        <h2 id="settings-account">Account</h2>
        <div className="glass settings-card">
          <div className="settings-row">
            <span>
              <small>Signed in as</small>
              <b className="literal-text">{email}</b>
            </span>
          </div>
          <ContactRow />
          <form action={signOut}>
            <button className="settings-row" type="submit">
              <span>
                <b>Sign Out</b>
              </span>
            </button>
          </form>
          <button className="settings-row settings-row-danger" type="button" onClick={onDeleteAccount}>
            <span>
              <b>Delete My Account</b>
              <small>
                Locked straight away, recoverable for {DELETION_GRACE_PERIOD_DAYS} days
              </small>
            </span>
          </button>
        </div>
      </section>
    </div>
  );
}

/**
 * The contact address. The link needs an email app on the device (on many
 * laptops and in-app browsers it does nothing), so Copy always works too.
 */
function ContactRow() {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(CONTACT_EMAIL);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1400);
    } catch {
      // Clipboard blocked: the address is on screen to copy by hand.
    }
  }

  return (
    <div className="settings-row">
      <a className="settings-row-link" href={`mailto:${CONTACT_EMAIL}`}>
        <b>Contact Us</b>
        <small className="literal-text">{CONTACT_EMAIL}</small>
      </a>
      <button
        className={`profile-more bordered profile-copy${copied ? " accent-text" : ""}`}
        type="button"
        aria-label={copied ? "Copied" : "Copy the contact email"}
        title={copied ? "Copied" : "Copy"}
        onClick={() => void copy()}
      >
        <svg
          viewBox="0 0 24 24"
          width="16"
          height="16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          {copied ? (
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          ) : (
            <>
              <rect x="9" y="9" width="11" height="11" rx="2.5" />
              <path d="M15 9V6.5A2.5 2.5 0 0 0 12.5 4h-6A2.5 2.5 0 0 0 4 6.5v6A2.5 2.5 0 0 0 6.5 15H9" />
            </>
          )}
        </svg>
      </button>
    </div>
  );
}

/** A row that opens one of the public info pages. */
function InfoRow({ page, note }: { page: InfoPageId; note?: string }) {
  const { path, title, summary } = INFO_PAGES[page];
  return (
    <Link className="settings-row" href={`${path}?${FROM_APP_PARAM}`}>
      <span>
        <b>{title}</b>
        <small>{note ?? summary}</small>
      </span>
      <span className="settings-chevron" aria-hidden="true">
        ›
      </span>
    </Link>
  );
}

/** The switch for the click on each action, saved on this device. */
function TurnSoundSetting() {
  // Settings only opens after the app has loaded, so storage can be read here.
  const [on, setOn] = useState(readTurnSound);
  return (
    <div className="settings-row">
      <span>
        <b>Button click sounds</b>
        <small>A soft click on each action in a hand</small>
      </span>
      <button
        className="switch"
        type="button"
        role="switch"
        aria-checked={on}
        aria-label="Button click sounds"
        onClick={() => {
          storeTurnSound(!on);
          setOn(!on);
        }}
      />
    </div>
  );
}
