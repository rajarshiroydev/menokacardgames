import type { Metadata } from "next";

import { InfoPage } from "@/components/info-page";
import { APP_NAME } from "@/lib/brand";
import { CHANGE_TAG_LABELS, CHANGELOG, type ChangeTag } from "@/lib/info/changelog";
import { formatInfoDate } from "@/lib/info/legal";

export const metadata: Metadata = {
  title: `What's New · ${APP_NAME}`,
  description: `New features and fixes in ${APP_NAME}, newest first.`,
};

const TAG_ORDER: ChangeTag[] = ["new", "improved", "fixed"];

export default function WhatsNewPage() {
  return (
    <InfoPage
      page="whats-new"
      intro={
        <p>
          Every change you can notice, newest first. <b>New</b> is something you
          couldn&apos;t do before, <b>Improved</b> makes something better, and{" "}
          <b>Fixed</b> is a bug squashed.
        </p>
      }
    >
      {CHANGELOG.map((entry) => (
        <section className="glass info-section changelog-entry" key={entry.date}>
          <h2>
            <time dateTime={entry.date}>{formatInfoDate(entry.date)}</time>
          </h2>
          <p className="changelog-title">{entry.title}</p>
          <ul className="changelog-items">
            {[...entry.items]
              .sort((a, b) => TAG_ORDER.indexOf(a.tag) - TAG_ORDER.indexOf(b.tag))
              .map((item) => (
                <li key={item.text}>
                  <span className={`change-tag change-tag-${item.tag}`}>
                    {CHANGE_TAG_LABELS[item.tag]}
                  </span>
                  <span>{item.text}</span>
                </li>
              ))}
          </ul>
        </section>
      ))}
    </InfoPage>
  );
}
