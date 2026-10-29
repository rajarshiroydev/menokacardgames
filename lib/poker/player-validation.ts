import { visibleText } from "../visible-text.ts";

export const MAX_PLAYER_NAME_LENGTH = 80;

export function cleanPlayerName(value: unknown) {
  const name = visibleText(value);

  if (!name || name.length > MAX_PLAYER_NAME_LENGTH) {
    throw new Error(
      `Player names must be 1 to ${MAX_PLAYER_NAME_LENGTH} characters`,
    );
  }

  return name;
}

export function playerNameKey(value: unknown) {
  return cleanPlayerName(value).toLocaleLowerCase("en-IN");
}
