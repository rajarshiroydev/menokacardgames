"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import {
  cleanDisplayName,
  MAX_DISPLAY_NAME_LENGTH,
} from "@/lib/accounts/identity-code";
import { apiErrorMessage } from "@/lib/security/rate-limit-message";
import { BrandMark } from "@/components/brand-mark";
import { ThemeToggle } from "@/components/theme-toggle";

/**
 * The first step after signing in: an account without a name sees only this
 * screen until it saves one. The home page decides on the server whether to
 * show it, so the ledger never opens for a nameless account.
 */
export function NameSetup() {
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  async function saveName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    let displayName: string;
    try {
      displayName = cleanDisplayName(name);
    } catch (nameError) {
      setError(nameError instanceof Error ? nameError.message : "Enter your name");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update-profile", displayName }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) {
        setError(
          apiErrorMessage(response.status, data.error, "Could not save your name"),
        );
        setSaving(false);
        return;
      }
      // Keep the button disabled: the refreshed page replaces this screen.
      router.refresh();
    } catch {
      setError("Could not save your name. Check your connection and try again.");
      setSaving(false);
    }
  }

  return (
    <main className="auth-page">
      <ThemeToggle className="page-theme-toggle" />
      <section className="auth-card" aria-labelledby="name-setup-title">
        <BrandMark className="auth-mark" />
        <p className="eyebrow">Welcome</p>
        <h1 id="name-setup-title">What should friends call you?</h1>
        <p className="auth-intro">
          Before you start, save the name your friends know you by. They see it
          when you send or accept a friend request, never your email. You can
          change it later on the Players screen.
        </p>
        <form onSubmit={saveName} className="auth-form">
          <label htmlFor="display-name">Your name</label>
          <input
            id="display-name"
            name="displayName"
            type="text"
            autoComplete="name"
            autoCapitalize="words"
            maxLength={MAX_DISPLAY_NAME_LENGTH}
            placeholder="Your name"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              if (error) setError("");
            }}
            required
            autoFocus
          />
          {error ? (
            <p className="auth-error" role="alert">
              {error}
            </p>
          ) : null}
          <button type="submit" disabled={saving || name.trim() === ""}>
            {saving ? "Saving…" : "Save and continue"}
          </button>
        </form>
      </section>
    </main>
  );
}
