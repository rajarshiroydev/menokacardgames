import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Poker Ledger",
    short_name: "Poker",
    description:
      "Track casual poker games, finished sessions, and the all-time leaderboard.",
    start_url: "/",
    display: "standalone",
    background_color: "#0B120F",
    theme_color: "#0B120F",
  };
}
