import "server-only";

import { createNeonAuth } from "@neondatabase/auth/next/server";
import { handleAuthProxyRequest } from "@neondatabase/auth/server";

function requiredEnvironmentVariable(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not configured`);
  }
  return value;
}

const baseUrl = requiredEnvironmentVariable("NEON_AUTH_BASE_URL");
const cookieSecret = requiredEnvironmentVariable("NEON_AUTH_COOKIE_SECRET");

export const auth = createNeonAuth({
  baseUrl,
  cookies: {
    secret: cookieSecret,
  },
});

export function exchangeMagicLinkVerifier(request: Request) {
  return handleAuthProxyRequest({
    request,
    path: "get-session",
    baseUrl,
    cookieSecret,
  });
}

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
