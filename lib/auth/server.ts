import "server-only";

import { createNeonAuth } from "@neondatabase/auth/next/server";
import { handleAuthProxyRequest } from "@neondatabase/auth/server";

import type { AccountProfile } from "@/lib/accounts/identity-code";
import { accountAccessError, type HostAccount } from "@/lib/accounts/lifecycle";
import { provisionHostAccount } from "@/lib/accounts/server";
import {
  RECENT_SIGN_IN_REQUIRED,
  sessionTooOld,
  signedInRecently,
} from "@/lib/auth/recent-sign-in";
import { withoutSessionCookies } from "@/lib/auth/session-cookies";
import {
  limitErrorResponse,
  type RateLimitBucket,
} from "@/lib/security/limits";
import { logSecurityEvent } from "@/lib/security/security-log";
import { timed } from "@/lib/server-timing";

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
    request: withoutSessionCookies(request),
    path: "get-session",
    baseUrl,
    cookieSecret,
  });
}

/**
 * Neon Auth extends a session each day it is used, but the SDK's session cache
 * answers get-session itself and drops the renewed session_token cookie, so
 * the browser's cookie would still expire 7 days after sign-in. Skipping the
 * cache asks Neon Auth directly; the response carries any cookies it renewed.
 */
export function fetchUncachedSession(request: Request) {
  const url = new URL(request.url);
  url.search = "?disableCookieCache=true";
  return handleAuthProxyRequest({
    request: new Request(url, { method: "GET", headers: request.headers }),
    path: "get-session",
    baseUrl,
    cookieSecret,
  });
}

export type HostSession = NonNullable<Awaited<ReturnType<typeof getHostSession>>>;

export async function getHostSession() {
  const { data, error } = await timed("auth", () => auth.getSession());
  if (error || !data?.user) return null;
  // A sign-in lasts 90 days at most, however often it is used. Where cookies
  // can change (route handlers, server actions) the old session is also
  // revoked; a page just treats the person as signed out.
  if (sessionTooOld(data.session?.createdAt)) {
    logSecurityEvent("session-too-old", { authUserId: data.user.id });
    try {
      await auth.signOut();
    } catch {
      // Pages can't change cookies; the next sign-in replaces them.
    }
    return null;
  }
  return data;
}

function signInRequiredResponse() {
  return noStoreJson({ error: "Sign in to access this ledger" }, 401);
}

function noStoreJson(body: unknown, status: number) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export function recentSignInRequiredResponse(action: string) {
  logSecurityEvent("recent-sign-in-required", { action });
  return noStoreJson(
    {
      error: `Sign in again to confirm ${action}`,
      code: RECENT_SIGN_IN_REQUIRED,
    },
    403,
  );
}

type AccountAccess =
  | { readonly response: Response }
  | {
      readonly session: HostSession;
      readonly account: HostAccount;
      readonly profile: AccountProfile;
    };

/**
 * Verified session and account in any lifecycle state. Only account
 * management may use this; ledger data must go through requireHostAccount.
 * `rateLimit` counts the request against that bucket (lib/security/limits.ts):
 * "writes" for every request that changes data, "cards" for card pictures.
 */
export async function requireAccountSession(
  rateLimit?: RateLimitBucket,
): Promise<AccountAccess> {
  const session = await getHostSession();
  if (!session) return { response: signInRequiredResponse() } as const;

  try {
    const { account, profile } = await provisionHostAccount(
      session.user.id,
      rateLimit,
    );
    return { session, account, profile } as const;
  } catch (error) {
    const limited = limitErrorResponse(error);
    if (limited) return { response: limited } as const;
    console.error("host account provisioning error", error);
    return {
      response: noStoreJson({ error: "Could not access this account" }, 500),
    } as const;
  }
}

/** Ledger access: a verified session for an active, unlocked account. */
export async function requireHostAccount(
  rateLimit?: RateLimitBucket,
): Promise<AccountAccess> {
  const result = await requireAccountSession(rateLimit);
  if ("response" in result) return result;

  const accessError = accountAccessError(result.account);
  if (accessError) {
    return { response: noStoreJson({ error: accessError }, 423) } as const;
  }
  return result;
}

/** True when the verified session was created by a recent sign-in link. */
export function hasRecentSignIn(session: HostSession) {
  return signedInRecently(session.session?.createdAt);
}

/**
 * Permanent deletion requires an active account whose verified session was
 * created by a recent sign-in link, in place of a shared deletion password.
 */
export async function requireRecentHostAccount(): Promise<AccountAccess> {
  const result = await requireHostAccount("writes");
  if ("response" in result) return result;

  if (!hasRecentSignIn(result.session)) {
    return {
      response: recentSignInRequiredResponse("permanent deletion"),
    } as const;
  }
  return result;
}

