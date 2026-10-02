import "server-only";

import { getHostSession } from "@/lib/auth/server";
import { runAsAuthenticatedUser } from "@/lib/poker/database";

import type { AdminData } from "./data";

const GAME_LIMIT = 300;

function isForbidden(error: unknown) {
  return error instanceof Error && error.message.includes("admin:forbidden");
}

/**
 * Everything the admin dashboard shows, read in one transaction as the
 * signed-in person. The database decides who is an admin (`app_admins`,
 * migration 0018): "signed-out" and "forbidden" are the only refusals, and
 * the page shows both as not found so it doesn't reveal itself.
 * `detailAccountId` also loads one person in full, which is audited.
 */
export async function loadAdminData(
  detailAccountId: string | null,
): Promise<AdminData | "signed-out" | "forbidden"> {
  const session = await getHostSession();
  if (!session) return "signed-out";

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
    return {
      overview,
      accounts,
      guests,
      games,
      system,
      detail: detail ?? null,
    } as AdminData;
  } catch (error) {
    if (isForbidden(error)) return "forbidden";
    throw error;
  }
}
