import { RECENT_SIGN_IN_REQUIRED } from "@/lib/auth/recent-sign-in";
import { apiErrorMessage } from "@/lib/security/rate-limit-message";
import type { SettlementPayment } from "@/lib/poker/payments";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
  }
}

export function needsRecentSignIn(error: unknown) {
  return error instanceof ApiError && error.code === RECENT_SIGN_IN_REQUIRED;
}

export async function sessionsApi<T>(
  path = "",
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`/api/sessions${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  const data = (await response.json().catch(() => ({}))) as T & {
    code?: string;
    error?: string;
  };
  if (!response.ok) {
    throw new ApiError(
      apiErrorMessage(response.status, data.error, "Could not reach the ledger"),
      response.status,
      data.code,
    );
  }
  return data;
}

/** Reads the signed-in person's profile, or runs a profile action. */
export async function accountApi<T>(body?: object): Promise<T> {
  const response = await fetch(
    "/api/account",
    body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : undefined,
  );
  const data = (await response.json().catch(() => ({}))) as T & {
    code?: string;
    error?: string;
  };
  if (!response.ok) {
    throw new ApiError(
      apiErrorMessage(response.status, data.error, "Could not reach your account"),
      response.status,
      data.code,
    );
  }
  return data;
}

/** Reads the friends overview, or runs a friend action (`/api/friends`). */
export async function friendsApi<T>(body?: object): Promise<T> {
  const response = await fetch(
    "/api/friends",
    body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : undefined,
  );
  const data = (await response.json().catch(() => ({}))) as T & {
    code?: string;
    error?: string;
  };
  if (!response.ok) {
    throw new ApiError(
      apiErrorMessage(response.status, data.error, "Could not reach your friends"),
      response.status,
      data.code,
    );
  }
  return data;
}

/** Starts, updates or stops the live standings link (`/api/live`). */
/** Backups of the game in progress (app/api/game-backups). */
export async function gameBackupApi<T>(
  method: "GET" | "PUT" | "POST" | "DELETE",
  options: { query?: Record<string, string>; body?: object } = {},
): Promise<T> {
  const query = options.query
    ? `?${new URLSearchParams(options.query).toString()}`
    : "";
  const response = await fetch(`/api/game-backups${query}`, {
    method,
    ...(options.body
      ? {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(options.body),
        }
      : {}),
  });
  const data = (await response.json().catch(() => ({}))) as T & {
    code?: string;
    error?: string;
  };
  if (!response.ok) {
    throw new ApiError(
      apiErrorMessage(response.status, data.error, "Could not reach the backup"),
      response.status,
      data.code,
    );
  }
  return data;
}

export async function liveApi<T>(
  method: "POST" | "PUT" | "DELETE",
  body?: object,
): Promise<T> {
  const response = await fetch("/api/live", {
    method,
    ...(body
      ? {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : {}),
  });
  const data = (await response.json().catch(() => ({}))) as T & {
    code?: string;
    error?: string;
  };
  if (!response.ok) {
    throw new ApiError(
      apiErrorMessage(
        response.status,
        data.error,
        "Could not reach live standings",
      ),
      response.status,
      data.code,
    );
  }
  return data;
}

export async function playersApi<T>(
  path = "",
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`/api/players${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  const data = (await response.json().catch(() => ({}))) as T & {
    code?: string;
    error?: string;
  };
  if (!response.ok) {
    throw new ApiError(
      apiErrorMessage(
        response.status,
        data.error,
        "Could not reach the player list",
      ),
      response.status,
      data.code,
    );
  }
  return data;
}

/** Ticks or unticks a Settle up payment; returns the game's ticks after. */
export async function paymentsApi(
  body: object,
): Promise<{ payments: SettlementPayment[] }> {
  const response = await fetch("/api/payments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await response.json().catch(() => ({}))) as {
    payments?: SettlementPayment[];
    code?: string;
    error?: string;
  };
  if (!response.ok) {
    throw new ApiError(
      apiErrorMessage(response.status, data.error, "Could not mark the payment"),
      response.status,
      data.code,
    );
  }
  return { payments: data.payments ?? [] };
}

/**
 * Saves several ticks and unticks in one go (Mark all paid, or Settle up's
 * Save). `payments` is the game's ticks after, when they were all one game's.
 */
export async function paymentsBatchApi(
  items: object[],
): Promise<{ marked: number; payments?: SettlementPayment[] }> {
  const response = await fetch("/api/payments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items }),
  });
  const data = (await response.json().catch(() => ({}))) as {
    marked?: number;
    payments?: SettlementPayment[];
    code?: string;
    error?: string;
  };
  if (!response.ok) {
    throw new ApiError(
      apiErrorMessage(response.status, data.error, "Could not mark the payments"),
      response.status,
      data.code,
    );
  }
  return {
    marked: data.marked ?? 0,
    ...(data.payments ? { payments: data.payments } : {}),
  };
}
