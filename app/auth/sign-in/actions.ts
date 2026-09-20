"use server";

import { auth } from "@/lib/auth/server";
import { redirect } from "next/navigation";

export type MagicLinkState =
  | { status: "idle" }
  | { status: "sent"; email: string }
  | { status: "error"; message: string };

export async function sendMagicLink(
  _previousState: MagicLinkState,
  formData: FormData,
): Promise<MagicLinkState> {
  const email = String(formData.get("email") || "")
    .trim()
    .toLowerCase();

  if (
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  ) {
    return {
      status: "error",
      message: "Enter a valid email address.",
    };
  }

  try {
    const { error } = await auth.signIn.magicLink({
      email,
      callbackURL: "/",
    });

    if (error) {
      console.error("magic link request failed", error.code);
      return {
        status: "error",
        message: "We could not send the sign-in link. Please try again.",
      };
    }

    return { status: "sent", email };
  } catch (error) {
    console.error("magic link request failed", error);
    return {
      status: "error",
      message: "We could not send the sign-in link. Please try again.",
    };
  }
}

export async function signOut() {
  await auth.signOut();
  redirect("/auth/sign-in");
}
