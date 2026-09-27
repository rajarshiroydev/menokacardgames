"use server";

import { redirect } from "next/navigation";

import { auth } from "@/lib/auth/server";
import { testbedPersona } from "@/lib/testbed/personas";
import { testbedMode, testbedPersonaPassword } from "@/lib/testbed/server";

/**
 * Testbed only: signs in as one of the fake personas with their shared test
 * password, which never reaches the browser. Refuses outside testbed mode.
 */
export async function signInAsPersona(formData: FormData) {
  if (!testbedMode()) throw new Error("Not available");
  const persona = testbedPersona(String(formData.get("persona") ?? ""));
  if (!persona) throw new Error("Unknown persona");

  const { error } = await auth.signIn.email({
    email: persona.email,
    password: testbedPersonaPassword(),
  });
  if (error) {
    redirect(`/auth/sign-in?testbed=${encodeURIComponent(error.code ?? "failed")}`);
  }
  redirect("/");
}
