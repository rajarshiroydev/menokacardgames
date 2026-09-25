import "server-only";

import { createHash, randomBytes } from "node:crypto";

/** A new share token: 32 random bytes, unpadded base64url (43 characters). */
export function createLiveToken() {
  return randomBytes(32).toString("base64url");
}

/** The database stores and looks up only this hash, never the token. */
export function liveTokenHashHex(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
