"use client";

import { useContext, useEffect, useMemo, useState } from "react";

import { toneClass } from "@/components/ledger/avatar";
import { PencilIcon } from "@/components/ledger/icons";
import {
  CurrencyContext,
  describeChipValue,
  describePerChip,
  formatCents,
  PriceInput,
} from "@/components/ledger/money";
import {
  prefetchResultsCard,
  ShareResultsButton,
} from "@/components/ledger/results-card";
import { formatDate } from "@/lib/poker/game";
import { formatChips, formatSignedMoney, plainChipsCode } from "@/lib/poker/money";
import {
  HOUSE_NAME,
  MAX_CHIP_VALUE_CENTS,
  type Settlement,
  settleSession,
} from "@/lib/poker/settle-up";
import type { ChipValue, PokerSession } from "@/lib/poker/types";

/** The text Share sends: the game, its chip value and who pays whom. */
function settlementText(
  session: PokerSession,
  settlement: Settlement,
  currency: string,
) {
  const lines = [
    `Settle up · ${session.name || `Game ${session.sessionNumber ?? ""}`.trim()} (${formatDate(session.date)})`,
  ];
  if (session.chipValue) {
    lines.push(describeChipValue(session.chipValue, session.chipUnit, currency));
  }
  lines.push("");
  if (settlement.transfers.length) {
    for (const transfer of settlement.transfers) {
      lines.push(
        `${transfer.from} pays ${transfer.to} ${formatCents(transfer.cents, currency)}`,
      );
    }
  } else {
    lines.push("Nobody owes anything.");
  }
  return lines.join("\n");
}

/**
 * Settle up for a saved game: everyone's result in money at the chip value,
 * and who pays whom with the fewest transfers (lib/poker/settle-up.ts). The
 * chip value can be set or changed here. No money moves through the app.
 */
export function SettleUpSheet({
  session,
  onSaveChipValue,
  onCopied,
  onClose,
}: {
  session: PokerSession;
  /** Absent for a game at a friend's table: only the host sets the price. */
  onSaveChipValue?: (value: ChipValue | null) => Promise<boolean>;
  onCopied: () => void;
  onClose: () => void;
}) {
  const currency = useContext(CurrencyContext);
  const value = session.chipValue;
  const isHost = onSaveChipValue !== undefined;
  // Prices are asked for the starting stack, the buy-in people know.
  const stackPrice = value
    ? Math.round((value.cents * session.startStack) / value.chips)
    : null;
  const [editing, setEditing] = useState(false);
  const [price, setPrice] = useState<number | null>(stackPrice);
  const [saving, setSaving] = useState(false);
  const settlement = useMemo(() => {
    try {
      return settleSession(session);
    } catch {
      return null;
    }
  }, [session]);
  // Settle up opens right after a save, when people want the card: have it
  // ready so its preview opens at once.
  useEffect(() => {
    if (!settlement) return;
    const timer = setTimeout(() => prefetchResultsCard(session), 1000);
    return () => clearTimeout(timer);
  }, [session, settlement]);
  const cash = (cents: number) => formatCents(cents, currency);
  const stackChips = formatChips(
    session.startStack,
    session.chipUnit,
    plainChipsCode(currency),
  );
  const priceValid =
    price !== null && price >= 1 && price <= MAX_CHIP_VALUE_CENTS;
  const canShare = typeof navigator !== "undefined" && "share" in navigator;

  async function save(next: ChipValue | null) {
    if (!onSaveChipValue) return;
    setSaving(true);
    const saved = await onSaveChipValue(next);
    setSaving(false);
    if (saved) setEditing(false);
  }

  async function share() {
    if (!settlement) return;
    const text = settlementText(session, settlement, currency);
    if (canShare) {
      try {
        await navigator.share({ text });
      } catch {
        // The host closed the share sheet.
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      onCopied();
    } catch {
      // Clipboard blocked: the list is on screen to copy by hand.
    }
  }

  return (
    <div
      className="modal show"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="sheet settle-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settle-title"
      >
        <h2 id="settle-title">Settle Up</h2>
        <p className="muted rule-note">
          {session.name || `Game ${session.sessionNumber ?? ""}`} ·{" "}
          {formatDate(session.date)}
        </p>

        <div className={`settle-value${editing ? " editing" : ""}`}>
          {editing ? (
            <>
              <span className="label">Chip value</span>
              <label className="label" htmlFor="settle-price">
                A {stackChips}-chip buy-in costs
              </label>
              <PriceInput
                id="settle-price"
                label="What a buy-in costs"
                value={price}
                onChange={setPrice}
              />
              {priceValid ? (
                <p className="muted small-note">
                  {describePerChip(
                    { chips: session.startStack, cents: price! },
                    session.chipUnit,
                    currency,
                  )}
                </p>
              ) : null}
              <div className="button-pair">
                <button
                  className="ghost"
                  type="button"
                  disabled={saving}
                  onClick={() => setEditing(false)}
                >
                  Cancel
                </button>
                <button
                  className="primary"
                  type="button"
                  disabled={!priceValid || saving}
                  onClick={() =>
                    void save({ chips: session.startStack, cents: price! })
                  }
                >
                  {saving ? "Saving…" : "Save price"}
                </button>
              </div>
              {value ? (
                <button
                  className="text-button"
                  type="button"
                  disabled={saving}
                  onClick={() => void save(null)}
                >
                  Clear the price (1 chip = {cash(100)})
                </button>
              ) : null}
            </>
          ) : (
            <>
              <div className="settle-value-head">
                <span className="label">Chip value</span>
                {isHost ? (
                  <button
                    className="pill-button settle-change"
                    type="button"
                    onClick={() => {
                      setPrice(stackPrice);
                      setEditing(true);
                    }}
                  >
                    <PencilIcon />
                    {value ? "Change" : "Set price"}
                  </button>
                ) : null}
              </div>
              {value && stackPrice !== null ? (
                <>
                  <p className="settle-equation">
                    <span>{stackChips} chips</span>
                    <span className="settle-equals" aria-label="cost">
                      =
                    </span>
                    <span className="settle-price">{cash(stackPrice)}</span>
                  </p>
                  <span className="settle-value-note">
                    {describePerChip(value, session.chipUnit, currency)}
                  </span>
                </>
              ) : (
                <>
                  <p className="settle-equation">
                    <span>1 chip</span>
                    <span className="settle-equals" aria-label="is">
                      =
                    </span>
                    <span className="settle-price">{cash(100)}</span>
                  </p>
                  <span className="settle-value-note">
                    {isHost
                      ? "No price set. Change it if chips cost something else."
                      : "The host set no price."}
                  </span>
                </>
              )}
            </>
          )}
        </div>

        {settlement ? (
          <>
            <span className="label">Results</span>
            <div className="rows">
              {settlement.players.map((player) => (
                <div className="result-row" key={player.name}>
                  <span className="result-name">{player.name}</span>
                  <span className={`result-amount ${toneClass(player.net)}`}>
                    {formatSignedMoney(player.net / 100, currency)}
                  </span>
                </div>
              ))}
              {settlement.house ? (
                <div className="result-row">
                  <span className="result-name">{HOUSE_NAME} (rake)</span>
                  <span className="result-amount pos">
                    {formatSignedMoney(settlement.house / 100, currency)}
                  </span>
                </div>
              ) : null}
            </div>

            <span className="label">Who pays whom</span>
            {settlement.transfers.length ? (
              <div className="rows">
                {settlement.transfers.map((transfer) => (
                  <div
                    className="result-row"
                    key={`${transfer.from}>${transfer.to}`}
                  >
                    <span className="result-name">
                      {transfer.from} <span className="muted">pays</span>{" "}
                      {transfer.to}
                    </span>
                    <span className="result-amount">{cash(transfer.cents)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted small-note">Nobody owes anything.</p>
            )}
            <div className="button-pair">
              <button
                className="primary"
                type="button"
                disabled={editing}
                onClick={() => void share()}
              >
                {canShare ? "Share list" : "Copy list"}
              </button>
              <ShareResultsButton
                session={session}
                className="ghost share-button"
                label="Results card"
              />
            </div>
          </>
        ) : (
          <p className="field-error">
            This game&apos;s saved chips don&apos;t add up, so it can&apos;t be
            settled.
          </p>
        )}
        <button className="ghost full" type="button" onClick={onClose}>
          Done
        </button>
      </div>
    </div>
  );
}
