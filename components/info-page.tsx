import Link from "next/link";
import type { ReactNode } from "react";

import { BrandMark } from "@/components/brand-mark";
import { InfoBackLink } from "@/components/info-back-link";
import { ThemeToggle } from "@/components/theme-toggle";
import { APP_NAME } from "@/lib/brand";
import { CONTACT_EMAIL, formatInfoDate } from "@/lib/info/legal";
import { INFO_PAGES, type InfoPageId } from "@/lib/info/pages";

/** The frame every public info page shares: back, title, body and links. */
export function InfoPage({
  page,
  updated,
  intro,
  children,
}: {
  page: InfoPageId;
  /** ISO date the content last changed, shown under the title. */
  updated?: string;
  intro?: ReactNode;
  children: ReactNode;
}) {
  const { title } = INFO_PAGES[page];
  return (
    <main className="info-page">
      <div className="info-topbar">
        <InfoBackLink />
        <ThemeToggle />
      </div>
      <header className="info-head">
        <p className="eyebrow">
          <BrandMark className="info-mark" />
          {APP_NAME}
        </p>
        <h1>{title}</h1>
        {updated ? <p className="info-updated">Last updated {formatInfoDate(updated)}</p> : null}
        {intro ? <div className="info-intro">{intro}</div> : null}
      </header>
      <article className="info-body">{children}</article>
      <footer className="info-foot">
        <nav aria-label="More about Pokerize">
          {Object.values(INFO_PAGES)
            .filter((item) => item.id !== page)
            .map((item) => (
              <Link key={item.id} href={item.path}>
                {item.title}
              </Link>
            ))}
        </nav>
        <p>
          Questions? Email{" "}
          <a className="literal-text" href={`mailto:${CONTACT_EMAIL}`}>
            {CONTACT_EMAIL}
          </a>
        </p>
      </footer>
    </main>
  );
}

/** A titled section of an info page. */
export function InfoSection({
  id,
  title,
  children,
}: {
  id?: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="glass info-section" id={id}>
      <h2>{title}</h2>
      {children}
    </section>
  );
}
