import type { Metadata, Viewport } from "next";
import {
  DM_Serif_Display,
  IBM_Plex_Mono,
  Manrope,
} from "next/font/google";

import "./globals.css";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
});

const displaySerif = DM_Serif_Display({
  variable: "--font-display-serif",
  subsets: ["latin"],
  weight: "400",
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Menoka Card Games",
  description:
    "A mobile-friendly poker session tracker with shared history and leaderboards.",
  applicationName: "Menoka Card Games",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Menoka Card Games",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0B120F",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${manrope.variable} ${displaySerif.variable} ${plexMono.variable} antialiased`}
    >
      <body>{children}</body>
    </html>
  );
}
