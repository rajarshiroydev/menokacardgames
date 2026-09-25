import type { Metadata } from "next";

import { LiveStandings } from "@/components/live-standings";

export const metadata: Metadata = {
  title: "Live standings · Menoka Card Games",
  // The link itself is the credential, so keep it out of search results and
  // out of the Referer header sent to other sites.
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function LivePage(props: PageProps<"/live/[token]">) {
  const { token } = await props.params;
  return <LiveStandings token={token} />;
}
