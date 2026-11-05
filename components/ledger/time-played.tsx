"use client";

import { useEffect, useState } from "react";

/**
 * A length of play as "2h 31m", "2h" or "45m". Compact on purpose: the game
 * cards title-case their meta lines, which would turn "2 h 31 min" into
 * "2 H 31 Min"; a word starting with a digit is left alone.
 */
export function formatTimePlayed(ms: number) {
  const minutes = Math.max(1, Math.round(ms / 60_000));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest}m`;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

/**
 * How long a saved game ran, or null when the times don't give a length
 * (imported or friend games saved without an end time).
 */
export function timePlayed(start: number, end: number) {
  return end > start ? formatTimePlayed(end - start) : null;
}

/** The live game's time played since it started, updated every 15 seconds. */
export function useTimePlayed(startedAt: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, []);
  return formatTimePlayed(now - startedAt);
}
