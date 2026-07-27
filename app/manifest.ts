import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Menoka Card Games",
    short_name: "Menoka",
    description:
      "Track casual poker games, finished sessions, and the all-time leaderboard.",
    start_url: "/",
    display: "standalone",
    background_color: "#0B120F",
    theme_color: "#0B120F",
  };
}
