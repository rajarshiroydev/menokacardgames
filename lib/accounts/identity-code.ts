/**
 * User codes (for accounts) and player codes (for a host's player profiles).
 * The database generates both (`public.new_identity_code()` in migration
 * 0010): eight characters from an alphabet without 0/O or 1/I/L, so a code
 * read aloud at the table can't be mistyped into a different one. They are
 * identifiers, not secrets.
 */
export const IDENTITY_CODE_PATTERN = /^[2-9A-HJKMNP-Z]{8}$/;

export function isIdentityCode(value: unknown): value is string {
  return typeof value === "string" && IDENTITY_CODE_PATTERN.test(value);
}

/** How a user code is shown and shared: `7KQ4-M2XP`. */
export function formatUserCode(code: string) {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

/** Player codes carry a `P-` prefix so nobody mistakes one for a user code. */
export function formatPlayerCode(code: string) {
  return `P-${formatUserCode(code)}`;
}

export const MAX_DISPLAY_NAME_LENGTH = 40;

/** The name a person shows to others in the friend network. */
export function cleanDisplayName(value: unknown) {
  const name =
    typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";

  if (!name || name.length > MAX_DISPLAY_NAME_LENGTH) {
    throw new Error(
      `Your name must be 1 to ${MAX_DISPLAY_NAME_LENGTH} characters`,
    );
  }

  return name;
}

export type AccountProfile = {
  userCode: string;
  displayName: string | null;
};
