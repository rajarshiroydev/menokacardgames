import type { MetadataRoute } from "next";

import { APP_NAME } from "@/lib/brand";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: APP_NAME,
    short_name: APP_NAME,
    description:
      "Track casual poker games, finished sessions, and the all-time leaderboard.",
    start_url: "/",
    display: "standalone",
    background_color: "#0B120F",
    theme_color: "#0B120F",
  };
}
