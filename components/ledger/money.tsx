"use client";

import {
  createContext,
  InputHTMLAttributes,
  ReactNode,
  useContext,
  useMemo,
  useState,
} from "react";

import { PokerizeBadge } from "@/components/pokerize-badge";
import {
  chipCurrency,
  chipScale,
  chipsToInput,
  type ChipUnit,
  currencySymbol,
  DEFAULT_CURRENCY,
  formatChips,
  formatMoney,
  formatSignedChips,
  parseChips,
  plainChipsCode,
} from "@/lib/poker/money";
import type {
  BlindSchedule,
  ChipValue,
  GameState,
  PlayerProfile,
} from "@/lib/poker/types";

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
type AvatarLookup = (playerId?: string, name?: string) => string | undefined;
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

/**
 * An amount box in the current chip unit: it shows 0.25 for 25 cents and
 * reports stored chips. Text that isn't an amount (empty, or too many
 * decimals) reports 0, which the forms already refuse.
 */
export function ChipInput({
  value,
  onChange,
  ...props
}: Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange" | "type" | "inputMode"
> & {
  value: number | null;
  onChange: (chips: number) => void;
}) {
  const unit = useContext(ChipUnitContext);
  const shown = value === null ? "" : chipsToInput(value, unit);
  const [text, setText] = useState(shown);
  // Follow changes made elsewhere (a preset, a unit switch) without
  // rewriting what is being typed, such as "0." on the way to "0.5".
  if (value !== null && (parseChips(text, unit) ?? 0) !== value) {
    setText(shown);
  }
  return (
    <input
      {...props}
      type="text"
      inputMode={unit === "cents" ? "decimal" : "numeric"}
      autoComplete="off"
      value={text}
      onChange={(event) => {
        setText(event.target.value);
        onChange(parseChips(event.target.value, unit) ?? 0);
      }}
    />
  );
}

/**
 * A money amount in the host's currency, such as what a buy-in costs. It
 * reports hundredths, whatever the game's chip unit is.
 */
export function PriceInput({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: number | null;
  onChange: (cents: number) => void;
}) {
  const currency = useContext(CurrencyContext);
  return (
    <div className="money-field">
      <span aria-hidden="true">{currencySymbol(currency).trim()}</span>
      <ChipUnitContext.Provider value="cents">
        <ChipInput
          className="field"
          id={id}
          aria-label={label}
          placeholder="0"
          value={value}
          onChange={onChange}
        />
      </ChipUnitContext.Provider>
    </div>
  );
}

/** "₹500", from hundredths of the currency. */
export function formatCents(cents: number, currency: string) {
  return formatMoney(cents / 100, currency);
}

/** What one chip costs: "1 chip = ₹0.05", to four decimals at most. */
export function describePerChip(
  value: ChipValue,
  unit: ChipUnit | undefined,
  currency: string,
) {
  const perChip = (value.cents * chipScale(unit)) / value.chips / 100;
  return `1 chip = ${formatMoney(perChip, currency, 4)}`;
}

/** A chip value as the host set it: "10,000 chips = ₹500". */
export function describeChipValue(
  value: ChipValue,
  unit: ChipUnit | undefined,
  currency: string,
) {
  const chipsShown = formatChips(value.chips, unit, plainChipsCode(currency));
  return `${chipsShown} chip${value.chips === chipScale(unit) ? "" : "s"} = ${formatCents(value.cents, currency)}`;
}

export function describeBlindSchedule(
  schedule: BlindSchedule | null,
  currency: string,
  unit: ChipUnit | undefined,
) {
  if (!schedule) return "Fixed blinds";
  const interval = `${schedule.every} ${schedule.unit === "hands"
    ? schedule.every === 1 ? "hand" : "hands"
    : schedule.every === 1 ? "minute" : "minutes"}`;
  return schedule.raiseType === "add"
    ? `Add ${formatChips(schedule.raiseBy, unit, currency)} to the big blind every ${interval}`
    : `Multiply the big blind by ${schedule.raiseBy} every ${interval}`;
}
