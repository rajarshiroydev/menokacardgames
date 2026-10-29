/**
 * Characters that change how a name looks without being seen: direction
 * overrides (which can make "Rajarshi" display as another name), zero-width
 * spaces and joiners other than the two that scripts need, and characters
 * that render as blank space. Removed from every name (pre-launch audit
 * step 5). The zero-width joiner and non-joiner (U+200C, U+200D) stay:
 * Bengali, Hindi and emoji sequences use them.
 */
const HIDDEN_CHARACTERS =
  /[\p{Cc}­͏؜ᅟᅠ᠎​‎‏‪-‮⁠-⁤⁦-⁩⠀ㅤ﻿ﾠ]/gu;

/**
 * Text as people see it: in one Unicode form (NFC), without hidden
 * characters, with runs of spaces made one, trimmed. Used for every name the
 * app stores: people, players and games.
 */
export function visibleText(value: unknown) {
  return String(value ?? "")
    .normalize("NFC")
    .replace(HIDDEN_CHARACTERS, "")
    .replace(/\s+/g, " ")
    .trim();
}
