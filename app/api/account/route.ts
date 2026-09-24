import {
  canRecoverAccount,
  deletionDeadline,
  type HostAccount,
} from "@/lib/accounts/lifecycle";
import { recoverAccount, requestAccountDeletion } from "@/lib/accounts/server";
import {
  auth,
  hasRecentSignIn,
  recentSignInRequiredResponse,
  requireAccountSession,
} from "@/lib/auth/server";

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
  return json({ account: accountSummary(result.account) });
}

export async function POST(request: Request) {
  const result = await requireAccountSession();
  if ("response" in result) return result.response;
  const { account, session } = result;

  let action: unknown;
  try {
    action = ((await request.json()) as { action?: unknown }).action;
  } catch {
    return json({ error: "Invalid request" }, 400);
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
