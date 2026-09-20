import "server-only";

import { createNeonAuth } from "@neondatabase/auth/next/server";

function requiredEnvironmentVariable(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not configured`);
  }
  return value;
}

export const auth = createNeonAuth({
  baseUrl: requiredEnvironmentVariable("NEON_AUTH_BASE_URL"),
  cookies: {
    secret: requiredEnvironmentVariable("NEON_AUTH_COOKIE_SECRET"),
  },
});

export async function getHostSession() {
  const { data, error } = await auth.getSession();
  if (error || !data?.user) return null;
  return data;
}

export async function requireHostSession() {
  const session = await getHostSession();
  if (session) return { session } as const;

  return {
    response: Response.json(
      { error: "Sign in to access this ledger" },
      {
        status: 401,
        headers: { "Cache-Control": "no-store" },
      },
    ),
  } as const;
}
