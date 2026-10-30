export type View =
  | "home"
  | "newGame"
  | "setup"
  | "game"
  | "history"
  | "sessions"
  | "profile"
  | "settings"
  | "hands"
  | "whoWins";

export const VIEWS: readonly View[] = [
  "home",
  "newGame",
  "setup",
  "game",
  "history",
  "sessions",
  "profile",
  "settings",
  "hands",
  "whoWins",
];

/**
 * Screens that show the player list or its count. It is reloaded when one
 * opens, because a friend accepting a request on their phone adds or links a
 * player here.
 */
export function showsPlayerList(view: View) {
  return (
    view === "home" || view === "profile" || view === "setup" || view === "whoWins"
  );
}
