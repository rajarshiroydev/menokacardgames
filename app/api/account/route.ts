import {
  accountAccessError,
  canRecoverAccount,
  deletionDeadline,
  type HostAccount,
} from "@/lib/accounts/lifecycle";
import { cleanDisplayName } from "@/lib/accounts/identity-code";
import {
  readAccountProfile,
  recoverAccount,
  replaceUserCode,
  requestAccountDeletion,
  updateDisplayName,
} from "@/lib/accounts/server";
import {
  auth,
  hasRecentSignIn,
  recentSignInRequiredResponse,
  requireAccountSession,
} from "@/lib/auth/server";
import { readJsonBody, SMALL_JSON_BODY_LIMIT } from "@/lib/security/json-body";

export const dynamic = "force-dynamic";

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function accountSummary(account: HostAccount) {
  return {
    lifecycleState: account.lifecycleState,
    deletionRequestedAt: account.deletionRequestedAt,
    deletionDeadline:
      account.deletionRequestedAt === null
        ? null
        : deletionDeadline(account.deletionRequestedAt),
    recoverable: canRecoverAccount(account),
  };
}

export async function GET() {
  const result = await requireAccountSession();
  if ("response" in result) return result.response;
  const { account, session } = result;
  if (account.lifecycleState !== "active") {
    return json({ account: accountSummary(account) });
  }

  try {
    const profile = await readAccountProfile(session.user.id);
    return json({ account: accountSummary(account), profile });
  } catch (error) {
    console.error("account profile read error", error);
    return json({ error: "Could not load your profile" }, 500);
  }
}

export async function POST(request: Request) {
  const result = await requireAccountSession();
  if ("response" in result) return result.response;
  const { account, session } = result;

  const read = await readJsonBody(request, SMALL_JSON_BODY_LIMIT);
  if (!read.ok) return json({ error: read.error }, read.status);
  const action = (read.body as { action?: unknown } | null)?.action;

  if (action === "update-profile" || action === "replace-code") {
    const accessError = accountAccessError(account);
    if (accessError) return json({ error: accessError }, 423);

    let displayName = "";
    if (action === "update-profile") {
      try {
        displayName = cleanDisplayName(
          (read.body as { displayName?: unknown }).displayName,
        );
      } catch (error) {
        return json(
          { error: error instanceof Error ? error.message : "Invalid name" },
          400,
        );
      }
    }

    try {
      const profile =
        action === "update-profile"
          ? await updateDisplayName(session.user.id, displayName)
          : await replaceUserCode(session.user.id);
      if (!profile) {
        return json({ error: "This account is locked while deletion is pending" }, 423);
      }
      return json({ profile });
    } catch (error) {
      console.error(`account ${action} error`, error);
      return json(
        {
          error:
            action === "update-profile"
              ? "Could not save your name"
              : "Could not replace your code",
        },
        500,
      );
    }
  }

  if (action === "request-deletion") {
    if (account.lifecycleState !== "active") {
      return json({ error: "Deletion has already been requested" }, 409);
    }
    if (!hasRecentSignIn(session)) {
      return recentSignInRequiredResponse("account deletion");
    }

    try {
      const locked = await requestAccountDeletion(session.user.id);
      if (!locked) {
        return json({ error: "Deletion has already been requested" }, 409);
      }

      // The database lock is authoritative. Revoking sessions signs the host
      // out everywhere; a failure is logged but cannot reopen the ledger.
      try {
        await auth.revokeSessions();
      } catch (error) {
        console.error("session revocation after deletion request failed", error);
      }
      try {
        await auth.signOut();
      } catch (error) {
        console.error("sign-out after deletion request failed", error);
      }

      return json({ account: accountSummary(locked) });
    } catch (error) {
      console.error("account deletion request error", error);
      return json({ error: "Could not request account deletion" }, 500);
    }
  }

  if (action === "recover") {
    if (!canRecoverAccount(account)) {
      return json(
        {
          error:
            account.lifecycleState === "active"
              ? "This account is not scheduled for deletion"
              : "The recovery period for this account has ended",
        },
        409,
      );
    }
    if (!hasRecentSignIn(session)) {
      return recentSignInRequiredResponse("account recovery");
    }

    try {
      const recovered = await recoverAccount(session.user.id);
      if (!recovered) {
        return json({ error: "The account could not be recovered" }, 409);
      }
      return json({ account: accountSummary(recovered) });
    } catch (error) {
      console.error("account recovery error", error);
      return json({ error: "Could not recover the account" }, 500);
    }
  }

  return json({ error: "Unknown account action" }, 400);
}
