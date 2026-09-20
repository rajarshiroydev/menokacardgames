import { redirect } from "next/navigation";

import { getHostSession } from "@/lib/auth/server";

import { MagicLinkForm } from "./magic-link-form";

export const dynamic = "force-dynamic";

export default async function SignInPage() {
  if (await getHostSession()) redirect("/");

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="sign-in-title">
        <div className="auth-mark" aria-hidden="true">
          ♠
        </div>
        <p className="eyebrow">Menoka Card Games</p>
        <h1 id="sign-in-title">Your private poker ledger</h1>
        <p className="auth-intro">
          Sign in with your email to manage your friend list, games, and
          standings. No password is needed.
        </p>
        <MagicLinkForm />
      </section>
    </main>
  );
}
