"use client";

import Link from "next/link";

import { FROM_APP_PARAM } from "@/lib/info/pages";

/**
 * Back from an info page. Opened from Settings, it steps back through the
 * history so the app reopens on Settings; opened any other way (a shared link,
 * the sign-in page, an app store), it goes to the app's front door.
 */
export function InfoBackLink() {
  return (
    <Link
      className="info-back"
      href="/"
      onClick={(event) => {
        if (!window.location.search.includes(FROM_APP_PARAM)) return;
        event.preventDefault();
        window.history.back();
      }}
    >
      <span aria-hidden="true">‹</span> Back
    </Link>
  );
}
