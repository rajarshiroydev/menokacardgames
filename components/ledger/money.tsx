"use client";

import { createContext, type ReactNode, useContext, useMemo } from "react";

import { PokerizeBadge } from "@/components/pokerize-badge";
import {
  type ChipUnit,
  chipCurrency,
  currencySymbol,
  DEFAULT_CURRENCY,
  formatChips,
  formatSignedChips,
} from "@/lib/poker/money";
import type { GameState, PlayerProfile } from "@/lib/poker/types";

/** The signed-in host's currency, for every amount the ledger shows. */
export const CurrencyContext = createContext<string>(DEFAULT_CURRENCY);

/**
 * What the amounts below mean: a game's or saved game's own chip unit, so a
 * cents game's 25 shows as 0.25. Totals across games (standings, profile)
 * are already in currency units and use the default, "whole".
 */
export const ChipUnitContext = createContext<ChipUnit>("whole");

/**
 * The avatar a player in the host's list shows as, by player id or, for games
 * saved without ids, by name. Undefined means the drawing falls back to a
 * stable pick from the name.
 */
export type AvatarLookup = (playerId?: string, name?: string) => string | undefined;
export const AvatarContext = createContext<AvatarLookup>(() => undefined);

/**
 * A name that may wrap, with the badge kept on the line of its last word so
 * it never sits alone on a line.
 */
export function BadgedName({
  name,
  badge,
  isMe,
  hint,
}: {
  name: string;
  badge: boolean;
  isMe?: boolean;
  hint?: string;
}) {
  if (!badge) return <>{name}</>;
  const cut = name.trimEnd().lastIndexOf(" ") + 1;
  return (
    <>
      {name.slice(0, cut)}
      <span className="badge-keep">
        {name.slice(cut)}
        <PokerizeBadge name={name} isMe={isMe} hint={hint} />
      </span>
    </>
  );
}

export function buildAvatarLookup(
  players: PlayerProfile[],
  selfPlayerId: string | null,
  selfAvatar: string,
): AvatarLookup {
  const byId = new Map<string, string>();
  const byName = new Map<string, string>();
  for (const player of players) {
    if (!player.avatar) continue;
    byId.set(player.id, player.avatar);
    byName.set(player.name.trim().toLowerCase(), player.avatar);
  }
  // Your own choice shows at once, before the list reloads.
  if (selfPlayerId) byId.set(selfPlayerId, selfAvatar);
  return (playerId, name) =>
    (playerId && byId.get(playerId)) ||
    (name ? byName.get(name.trim().toLowerCase()) : undefined);
}

/**
 * A game's amounts: its chip unit, and plain chip counts instead of money
 * when its chips have a value (they aren't a unit of the currency then).
 */
export function GameAmounts({
  game,
  children,
}: {
  game: Pick<GameState, "chipUnit" | "chipValue">;
  children: ReactNode;
}) {
  const currency = useContext(CurrencyContext);
  return (
    <CurrencyContext.Provider value={chipCurrency(currency, game.chipValue) ?? currency}>
      <ChipUnitContext.Provider value={game.chipUnit ?? "whole"}>
        {children}
      </ChipUnitContext.Provider>
    </CurrencyContext.Provider>
  );
}

export function useMoney() {
  const currency = useContext(CurrencyContext);
  const unit = useContext(ChipUnitContext);
  return useMemo(
    () => ({
      currency,
      unit,
      symbol: currencySymbol(currency),
      money: (value: number) => formatChips(value, unit, currency),
      signedMoney: (value: number) => formatSignedChips(value, unit, currency),
    }),
    [currency, unit],
  );
}
