import { timingSafeEqual } from "node:crypto";

import { databaseSizeWarning, purgeDueAccounts } from "@/lib/accounts/purge";
import {
  createNeonIdentityDeleter,
  createPurgeStore,
  databaseSizeBytes,
  deleteExpiredGameBackups,
  pingHealthcheck,
} from "@/lib/accounts/purge-server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  if (!secret) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const supplied = Buffer.from(header);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

/**
 * Daily Vercel Cron job: permanently deletes accounts whose 30-day recovery
 * period has ended, then backups of games in progress left for 7 days, then
 * checks the database's size: from 70% of the plan's limit the run fails, so
 * Healthchecks.io emails a warning. The response and the Healthchecks.io
 * report contain only counts, sizes, internal account IDs and error messages,
 * never emails or names.
 */
export async function GET(request: Request) {
  if (!authorized(request)) {
    return json({ error: "Unauthorized" }, 401);
  }

  await pingHealthcheck("start");
  try {
    const accounts = await purgeDueAccounts(
      createPurgeStore(),
      createNeonIdentityDeleter(),
    );
    // A failed backup clean-up doesn't undo the account purge; it is
    // reported and the next run deletes the backups.
    let expiredGameBackups: number | null = null;
    let backupError: string | undefined;
    try {
      expiredGameBackups = await deleteExpiredGameBackups();
    } catch (error) {
      backupError = error instanceof Error ? error.message : String(error);
    }
    // A failed size check is reported the same way as a full database.
    let databaseBytes: number | null = null;
    let sizeError: string | undefined;
    try {
      databaseBytes = await databaseSizeBytes();
      sizeError = databaseSizeWarning(databaseBytes) ?? undefined;
    } catch (error) {
      sizeError = `size check failed: ${error instanceof Error ? error.message : String(error)}`;
    }
    const report = {
      ...accounts,
      expiredGameBackups,
      databaseBytes,
      ...(backupError ? { backupError } : {}),
      ...(sizeError ? { sizeError } : {}),
    };
    const failed = Boolean(accounts.failed || backupError || sizeError);
    const summary = JSON.stringify(report);
    console.info("account purge run", summary);
    await pingHealthcheck(failed ? "fail" : "success", summary);
    return json(report, failed ? 500 : 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("account purge run failed", message);
    await pingHealthcheck("fail", `run failed: ${message}`);
    return json({ error: "Account purge run failed" }, 500);
  }
}
