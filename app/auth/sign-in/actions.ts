"use server";

import { auth } from "@/lib/auth/server";
import { redirect } from "next/navigation";

export async function signOut() {
  await auth.signOut();
  redirect("/auth/sign-in");
}

/**
 * Ends this account's sign-in on every phone and browser, this one included
 * (Settings → Sign Out Of All Devices). If that fails nothing is signed out,
 * and the message says so.
 */
export async function signOutEverywhere(): Promise<{ error: string } | void> {
  try {
    await auth.revokeSessions();
  } catch (error) {
    console.error("sign out of all devices failed", error);
    return { error: "Could not sign out of all devices. Please try again." };
  }
  try {
    await auth.signOut();
  } catch (error) {
    // Every session is already revoked; this cookie is replaced at sign-in.
    console.error("sign-out after revoking all sessions failed", error);
  }
  redirect("/auth/sign-in");
}
