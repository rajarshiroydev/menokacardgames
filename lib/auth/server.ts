import "server-only";

import { createNeonAuth } from "@neondatabase/auth/next/server";
import { handleAuthProxyRequest } from "@neondatabase/auth/server";

import { accountAccessError } from "@/lib/accounts/lifecycle";
import { provisionHostAccount } from "@/lib/accounts/server";

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

function signInRequiredResponse() {
  return Response.json(
    { error: "Sign in to access this ledger" },
    {
      status: 401,
      headers: { "Cache-Control": "no-store" },
    },
  );
}

export async function requireHostAccount() {
  const session = await getHostSession();
  if (!session) return { response: signInRequiredResponse() } as const;

  try {
    const account = await provisionHostAccount(session.user.id);
    const accessError = accountAccessError(account);

    if (accessError) {
      return {
        response: Response.json(
          { error: accessError },
          {
            status: 423,
            headers: { "Cache-Control": "no-store" },
          },
        ),
      } as const;
    }

    return { session, account } as const;
  } catch (error) {
    console.error("host account provisioning error", error);
    return {
      response: Response.json(
        { error: "Could not access this account" },
        {
          status: 500,
          headers: { "Cache-Control": "no-store" },
        },
      ),
    } as const;
  }
}
