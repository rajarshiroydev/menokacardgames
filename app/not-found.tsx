import type { Metadata } from "next";
import Link from "next/link";

import { BrandMark } from "@/components/brand-mark";
import { ThemeToggle } from "@/components/theme-toggle";
import { APP_NAME } from "@/lib/brand";

export const metadata: Metadata = {
  title: `Page not found · ${APP_NAME}`,
  robots: { index: false, follow: false },
};

/** Any address the app doesn't have, and the admin page for non-admins. */
export default function NotFound() {
  return (
    <main className="auth-page">
      <ThemeToggle className="page-theme-toggle" />
      <section className="auth-card" aria-labelledby="not-found-title">
        <BrandMark className="auth-mark" />
        <p className="eyebrow">{APP_NAME}</p>
        <h1 id="not-found-title">Page not found</h1>
        <p className="auth-intro">
          This page doesn&apos;t exist, or the link to it has expired.
        </p>
        <div className="error-page-actions">
          <Link className="auth-primary" href="/">
            Go to {APP_NAME}
          </Link>
        </div>
      </section>
    </main>
  );
}
