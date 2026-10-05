import { DELETION_GRACE_PERIOD_DAYS } from "../accounts/lifecycle.ts";
import { RECENT_SIGN_IN_WINDOW_MS } from "../auth/recent-sign-in.ts";
import { LIVE_VIEW_EXPIRY_HOURS } from "../poker/live-view.ts";

export { DELETION_GRACE_PERIOD_DAYS, LIVE_VIEW_EXPIRY_HOURS };

/**
 * Facts the public info pages (privacy, terms, account deletion) state.
 * Change them here, not in the pages, and bump the dates when the wording of
 * a policy changes (user decisions, 2026-10-05).
 */
export const OPERATOR_NAME = "Rajarshi Roy";
export const OPERATOR_COUNTRY = "India";
/** Public address for privacy questions, deletion requests and grievances. */
export const CONTACT_EMAIL = "therajarshiroy@gmail.com";
export const MINIMUM_AGE = 18;

/** Where the database and the app's servers run. */
export const DATA_LOCATION = "the United States";

export const PRIVACY_UPDATED = "2026-10-05";
export const TERMS_UPDATED = "2026-10-05";
export const DELETION_UPDATED = "2026-10-05";

/** Hours the database provider keeps recovery copies of deleted data. */
export const PROVIDER_BACKUP_HOURS = 6;
/** Minutes after signing in during which permanent deletions are allowed. */
export const RECENT_SIGN_IN_MINUTES = RECENT_SIGN_IN_WINDOW_MS / 60_000;

/** "5 October 2026", the way the info pages write dates. */
export function formatInfoDate(isoDate: string) {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}
