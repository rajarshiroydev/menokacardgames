import "server-only";

import {
  ADMIN_SIGN_IN_WINDOW_MS,
  signedInRecently,
} from "@/lib/auth/recent-sign-in";
import { getHostSession } from "@/lib/auth/server";
import { runAsAuthenticatedUser } from "@/lib/poker/database";
import { logSecurityEvent } from "@/lib/security/security-log";

import { type AdminData, type AdminGame, inCurrencyUnits } from "./data";

const GAME_LIMIT = 300;

function isForbidden(error: unknown) {
  return error instanceof Error && error.message.includes("admin:forbidden");
}

/** An admin whose last email sign-in is more than an hour old. */
export type AdminSignInAgain = { status: "sign-in-again"; email: string };

/**
 * Everything the admin dashboard shows, read in one transaction as the
 * signed-in person. The database decides who is an admin (`app_admins`,
 * migration 0018): "signed-out" and "forbidden" are the only refusals, and
 * the page shows both as not found so it doesn't reveal itself. An admin
 * also needs an email sign-in from the last hour (pre-launch audit step 5);
 * otherwise nothing is loaded and the page offers a fresh sign-in link.
 * `detailAccountId` also loads one person in full, which is audited.
 */
export async function loadAdminData(
  detailAccountId: string | null,
): Promise<AdminData | AdminSignInAgain | "signed-out" | "forbidden"> {
  const session = await getHostSession();
  if (!session) return "signed-out";

  if (
    !signedInRecently(
      session.session?.createdAt,
      Date.now(),
      ADMIN_SIGN_IN_WINDOW_MS,
    )
  ) {
    // The smallest admin-only read, so someone who isn't an admin still
    // gets a plain 404 rather than a sign-in prompt.
    try {
      await runAsAuthenticatedUser(
        session.user.id,
        (sql) => [sql`SELECT public.admin_system() AS value`],
        "admin",
      );
    } catch (error) {
      if (isForbidden(error)) {
        logSecurityEvent("admin-refused", { authUserId: session.user.id });
        return "forbidden";
      }
      throw error;
    }
    logSecurityEvent("admin-sign-in-again", { authUserId: session.user.id });
    return { status: "sign-in-again", email: session.user.email };
  }

  try {
    const results = await runAsAuthenticatedUser(
      session.user.id,
      (sql) => [
        sql`SELECT public.admin_overview() AS value`,
        sql`SELECT public.admin_accounts() AS value`,
        sql`SELECT public.admin_guests() AS value`,
        sql`SELECT public.admin_games(${GAME_LIMIT}::int) AS value`,
        sql`SELECT public.admin_system() AS value`,
        ...(detailAccountId
          ? [sql`SELECT public.admin_account_detail(${detailAccountId}::uuid) AS value`]
          : []),
      ],
      "admin",
    );
    const [overview, accounts, guests, games, system, detail] = results.map(
      (rows) => (rows[0] as { value: unknown } | undefined)?.value ?? null,
    );
    const data = {
      overview,
      accounts,
      guests,
      games,
      system,
      detail: detail ?? null,
    } as AdminData;
    // Games in cents show in currency units like every other amount.
    data.games = (data.games ?? []).map(inCurrencyUnits);
    if (data.detail) {
      data.detail.games = (data.detail.games ?? []).map(
        (game: AdminGame) => inCurrencyUnits(game),
      );
    }
    return data;
  } catch (error) {
    if (isForbidden(error)) {
      logSecurityEvent("admin-refused", { authUserId: session.user.id });
      return "forbidden";
    }
    throw error;
  }
}
