"use client";

import { useRouter } from "next/navigation";

import { BrandMark } from "@/components/brand-mark";
import { EmailCodeSignIn } from "@/components/email-code-sign-in";
import { ThemeToggle } from "@/components/theme-toggle";
import { APP_NAME } from "@/lib/brand";

/**
 * Shown at /admin to an admin whose last sign-in is more than an hour old
 * (pre-launch audit step 5): a fresh sign-in with an emailed code, then the
 * page renders again with the new sign-in and shows the dashboard.
 */
export function AdminSignInAgain({ email }: { email: string }) {
  const router = useRouter();
  return (
    <main className="auth-page">
      <ThemeToggle className="page-theme-toggle" />
      <section className="auth-card" aria-labelledby="admin-sign-in-title">
        <BrandMark className="auth-mark" />
        <p className="eyebrow">{APP_NAME} admin</p>
        <h1 id="admin-sign-in-title">Sign in again</h1>
        <p className="auth-intro">
          For safety, the admin dashboard needs a sign-in from the last hour.
        </p>
        <EmailCodeSignIn
          email={email}
          onSignedIn={() => router.refresh()}
        />
      </section>
    </main>
  );
}
