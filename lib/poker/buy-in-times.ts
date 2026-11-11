import type { Player } from "./types";

/**
 * When each buy-in happened (plan entry "buy-in times (plan)"). Rows read a
 * player's `buyInTimes`; the log, being plain text, keeps the time at the
 * end of a buy-in line ("Dev buys in again for ₹10,000 at 10:42 PM"), so it
 * travels with the line into the backup and the saved game's log.
 */

/**
 * "10:42 PM" on this phone's clock, as log lines and rows write it. Capital
 * letters, since the app's title case would turn "pm" into "Pm".
 */
export function clockTime(at: number) {
  return new Date(at)
    .toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })
    .toUpperCase();
}

/**
 * Records `at` for the buy-in just added to `player.buyIns`. A game from
 * before times were kept (fewer times than earlier buy-ins) stays without.
 * Times past the buy-ins (after a buy-in was taken back) are dropped first.
 */
export function noteBuyInTime(player: Player, at: number) {
  const count = player.buyIns?.length ?? 1;
  const times = player.buyInTimes ?? [];
  if (times.length < count - 1) return;
  player.buyInTimes = [...times.slice(0, count - 1), at];
}

/** When the player's latest buy-in happened, or null when it isn't known. */
export function latestBuyInTime(player: Player) {
  const count = player.buyIns?.length ?? 1;
  const times = player.buyInTimes;
  return times && times.length >= count ? times[count - 1] : null;
}

/**
 * The row's note about the latest buy-in: "last 10:42 PM" after a rebuy,
 * "joined 10:42 PM" for a late join, nothing for a buy-in at the start or
 * one with no time.
 */
export function buyInTimeNote(player: Player, startedAt: number) {
  const at = latestBuyInTime(player);
  if (at === null || at <= startedAt) return null;
  return `${(player.buyIns?.length ?? 1) > 1 ? "last" : "joined"} ${clockTime(at)}`;
}

/** A buy-in log line with its time at the end. */
export function withLogTime(line: string, at: number) {
  return `${line} at ${clockTime(at)}`;
}

const LOG_TIME = /^([\s\S]*\S) at (\d{1,2}:\d{2}\s?[ap]\.?m\.?)$/i;

/** A log line split into its text and the time at its end, if it has one. */
export function splitLogTime(line: string): { text: string; time: string | null } {
  const match = LOG_TIME.exec(line);
  return match ? { text: match[1], time: match[2] } : { text: line, time: null };
}
