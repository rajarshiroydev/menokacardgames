import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: process.cwd(),
  },
  outputFileTracingRoot: process.cwd(),
  // Files the results card reads at run time (app/api/sessions/[id]/card).
  outputFileTracingIncludes: {
    "/api/sessions/[id]/card": [
      "./assets/fonts/*.ttf",
      "./public/avatars/*.svg",
      "./public/icons/icon-192.png",
    ],
  },
};

export default nextConfig;
