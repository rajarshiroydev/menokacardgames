import type { Metadata, Viewport } from "next";
import { Barlow, Big_Shoulders } from "next/font/google";

import { THEME_STORAGE_KEY } from "@/lib/theme";

import "./globals.css";

const barlow = Barlow({
  variable: "--font-barlow",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

// Big Shoulders is one variable family now; opsz 72 is the Display cut.
const bigShoulders = Big_Shoulders({
  variable: "--font-big-shoulders",
  subsets: ["latin"],
  axes: ["opsz"],
  // Next has no metrics for this family, so name the fallback ourselves.
  adjustFontFallback: false,
  fallback: ["Arial Narrow", "sans-serif"],
});

// Runs before first paint so a saved light theme never flashes dark.
const themeScript = `try{var t=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)});if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

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
  themeColor: "#05080a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      data-theme="dark"
      suppressHydrationWarning
      className={`${barlow.variable} ${bigShoulders.variable} antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <div className="backdrop" aria-hidden="true">
          <span className="orb orb-green" />
          <span className="orb orb-blue" />
          <span className="orb orb-low" />
          <span className="pitch-lines" />
        </div>
        {children}
      </body>
    </html>
  );
}
