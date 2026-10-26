import "server-only";

import { createHash, randomBytes } from "node:crypto";

/** A new invite token: 32 random bytes, unpadded base64url (43 characters). */
export function createInviteToken() {
  return randomBytes(32).toString("base64url");
}

/** The database stores and looks up only this hash, never the token. */
export function inviteTokenHashHex(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
