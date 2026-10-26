import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: process.cwd(),
  },
  outputFileTracingRoot: process.cwd(),
  // Files the results card reads at run time (lib/poker/results-card-image.tsx),
  // for the host's card and a friend's.
  outputFileTracingIncludes: {
    "/api/sessions/[id]/card": [
      "./assets/fonts/*.ttf",
      "./public/avatars/*.svg",
      "./public/icons/icon-192.png",
    ],
    "/api/groups/card": [
      "./assets/fonts/*.ttf",
      "./public/avatars/*.svg",
      "./public/icons/icon-192.png",
    ],
  },
};

export default nextConfig;
