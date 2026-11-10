"use client";

import { useContext, useMemo, useState } from "react";

import { ApiError, paymentsBatchApi } from "@/components/ledger/api";
import { CheckIcon, PencilIcon } from "@/components/ledger/icons";
import {
  CurrencyContext,
  describeChipValue,
  describePerChip,
  formatCents,
  PriceInput,
} from "@/components/ledger/money";
import { APP_NAME } from "@/lib/brand";
import { formatDate } from "@/lib/poker/game";
import { formatChips, plainChipsCode } from "@/lib/poker/money";
import {
  type PaymentLine,
  paymentLines,
  type SettlementPayment,
  ticksClearedBy,
} from "@/lib/poker/payments";
import {
  BANK_NAME,
  MAX_CHIP_VALUE_CENTS,
  type Settlement,
  settleSession,
} from "@/lib/poker/settle-up";
import type { ChipValue, PokerSession } from "@/lib/poker/types";

/** Where a tick is sent: your own game by ID, a friend's by host and start time. */
export type PaymentTarget =
  | { sessionId: string }
  | { hostAccountId: string; date: number };

/** "Paid · marked by Bikram · 5 Nov 2026". */
function paidNote(paid: SettlementPayment) {
  const by = paid.markedByMe
    ? "you"
    : (paid.markedBy ?? "a former member");
  return `Paid · marked by ${by} · ${formatDate(paid.paidAt)}`;
}

const SITE_URL = "https://pokerize.app";
/** Second line of the text; the bare domain is auto-linked by chat apps. */
const CREDIT_LINE = `Scored with ${APP_NAME}.app`;

function escapeHtml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** The same lines as HTML, so rich-text pastes keep the credit as a link. */
function settlementHtml(text: string) {
  return text
    .split("\n")
    .map((line) =>
      line === CREDIT_LINE
        ? `<a href="${SITE_URL}">${escapeHtml(line)}</a>`
        : escapeHtml(line),
    )
    .join("<br>");
}

/** The text Share sends: the game, the credit, its chip value and who pays whom. */
function settlementText(
  session: PokerSession,
  settlement: Settlement,
  lines: PaymentLine[],
  isPaid: (line: PaymentLine) => boolean,
  currency: string,
) {
  const out = [
    `Settle up · ${session.name || `Game ${session.sessionNumber ?? ""}`.trim()} (${formatDate(session.date)})`,
    CREDIT_LINE,
  ];
  if (session.chipValue) {
    out.push(describeChipValue(session.chipValue, session.chipUnit, currency));
  }
  out.push("");
  if (settlement.transfers.length) {
    for (const line of lines) {
      const { transfer } = line;
      out.push(
        `${transfer.from} pays ${transfer.to} ${formatCents(transfer.cents, currency)}${
          isPaid(line) ? " (paid)" : ""
        }`,
      );
    }
  } else {
    out.push("Nobody owes anything.");
  }
  return out.join("\n");
}

/**
 * Settle up for a saved game: everyone's result in money at the chip value,
 * and who pays whom with the fewest transfers (lib/poker/settle-up.ts). The
 * chip value can be set or changed here. No money moves through the app.
 */
export function SettleUpSheet({
  session,
  onSaveChipValue,
  paymentTarget,
  onPayments,
  onStale,
  onError,
  onCopied,
  onClose,
}: {
  session: PokerSession;
  /** Absent for a game at a friend's table: only the host sets the price. */
  onSaveChipValue?: (value: ChipValue | null) => Promise<boolean>;
  /**
   * Where ticks go. Like Splitwise, the host and friends who played may tick
   * any payment (user decision 2026-11-05); absent shows no ticks.
   */
  paymentTarget?: PaymentTarget;
  /** The game's ticks changed; the card and Still owed follow. */
  onPayments?: (payments: SettlementPayment[]) => void;
  /**
   * The game changed elsewhere (another device or tab), so the server refused
   * a tick: reload the games, and Settle up shows the game as it is now.
   */
  onStale?: () => void;
  onError?: (message: string) => void;
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
  // Ticks a new price would clear, once the host has been told.
  const [clearing, setClearing] = useState(0);
  // Ticks changed here but not saved yet, by payment key: what each should
  // become. Ticking is instant; Save sends them (user request 2026-11-06).
  const [draft, setDraft] = useState<ReadonlyMap<string, boolean>>(new Map());
  const [savingTicks, setSavingTicks] = useState(false);
  // Done was pressed with unsaved ticks: ask once before throwing them away.
  const [confirmClose, setConfirmClose] = useState(false);
  const settlement = useMemo(() => {
    try {
      return settleSession(session);
    } catch {
      return null;
    }
  }, [session]);
  const lines = useMemo(
    () => paymentLines(session, settlement),
    [session, settlement],
  );
  const keyOf = (line: PaymentLine) =>
    `${line.transfer.fromKey}>${line.transfer.toKey}`;
  /** Whether a line shows as paid: its unsaved change, else what's saved. */
  const shownPaid = (line: PaymentLine) => draft.get(keyOf(line)) ?? Boolean(line.paid);
  const paidCount = lines.filter(shownPaid).length;
  const cash = (cents: number) => formatCents(cents, currency);
  const stackChips = formatChips(
    session.startStack,
    session.chipUnit,
    plainChipsCode(currency),
  );
  const priceValid =
    price !== null && price >= 1 && price <= MAX_CHIP_VALUE_CENTS;
  /** The field emptied or 0 on a priced game: Save clears the price, so
   *  1 chip counts as 1 unit again (user request 2026-11-06). */
  const resetting = Boolean(value) && !price;
  const canShare = typeof navigator !== "undefined" && "share" in navigator;

  async function save(next: ChipValue | null) {
    if (!onSaveChipValue) return;
    // The amounts change with the price, so ticks that no longer match a
    // payment are cleared: say how many first (user decision 2026-11-05).
    const cleared = ticksClearedBy(session, {
      ...session,
      ...(next ? { chipValue: next } : { chipValue: undefined }),
    });
    if (cleared && clearing !== cleared) {
      setClearing(cleared);
      return;
    }
    setSaving(true);
    const saved = await onSaveChipValue(next);
    setSaving(false);
    if (saved) {
      setEditing(false);
      setClearing(0);
      // The amounts changed, so unsaved ticks no longer name these payments.
      setDraft(new Map());
    }
  }

  /** Flips a tick on screen only; Save sends it. */
  function toggle(line: PaymentLine) {
    const key = keyOf(line);
    const next = new Map(draft);
    const want = !shownPaid(line);
    if (want === Boolean(line.paid)) next.delete(key);
    else next.set(key, want);
    setDraft(next);
    setConfirmClose(false);
  }

  async function saveTicks() {
    if (!paymentTarget || !draft.size || savingTicks) return;
    setSavingTicks(true);
    try {
      const { payments } = await paymentsBatchApi(
        lines.flatMap((line) =>
          draft.has(keyOf(line))
            ? [
                {
                  ...paymentTarget,
                  from: line.transfer.fromKey,
                  to: line.transfer.toKey,
                  cents: line.transfer.cents,
                  paid: draft.get(keyOf(line)),
                },
              ]
            : [],
        ),
      );
      if (payments) onPayments?.(payments);
      setDraft(new Map());
      setConfirmClose(false);
    } catch (error) {
      if (error instanceof ApiError && error.code === "payment-changed") {
        setDraft(new Map());
        onStale?.();
      }
      onError?.(
        error instanceof Error ? error.message : "Could not save the payments",
      );
    } finally {
      setSavingTicks(false);
    }
  }

  /** Closes, but asks once first if ticks aren't saved. */
  function close() {
    if (draft.size && !confirmClose) {
      setConfirmClose(true);
      return;
    }
    onClose();
  }

  async function share() {
    if (!settlement) return;
    const text = settlementText(session, settlement, lines, shownPaid, currency);
    if (canShare) {
      try {
        await navigator.share({ text });
      } catch {
        // The host closed the share sheet.
      }
      return;
    }
    try {
      try {
        // Rich copy first, so pasting into mail or notes keeps the link.
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/plain": new Blob([text], { type: "text/plain" }),
            "text/html": new Blob([settlementHtml(text)], { type: "text/html" }),
          }),
        ]);
      } catch {
        await navigator.clipboard.writeText(text);
      }
      onCopied();
    } catch {
      // Clipboard blocked: the list is on screen to copy by hand.
    }
  }

  return (
    <div
      className="modal show"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !savingTicks) close();
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
              ) : resetting ? (
                <p className="muted small-note">
                  No price: 1 chip = {cash(100)}
                </p>
              ) : null}
              <div className="button-pair">
                <button
                  className="ghost"
                  type="button"
                  disabled={saving}
                  onClick={() => {
                    setEditing(false);
                    setClearing(0);
                  }}
                >
                  Cancel
                </button>
                <button
                  className="primary"
                  type="button"
                  disabled={!(priceValid || resetting) || saving}
                  onClick={() =>
                    void save(
                      resetting ? null : { chips: session.startStack, cents: price! },
                    )
                  }
                >
                  {saving
                    ? "Saving…"
                    : clearing
                      ? "Save and clear"
                      : resetting
                        ? "Remove price"
                        : "Save price"}
                </button>
              </div>
              {clearing ? (
                <p className="settle-warning" role="status">
                  The amounts change with the price, so {clearing} paid mark
                  {clearing === 1 ? "" : "s"} will be cleared.
                </p>
              ) : null}
            </>
          ) : (
            <>
              <span className="label">Chip value</span>
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
                  {isHost ? null : (
                    <span className="settle-value-note">The host set no price.</span>
                  )}
                </>
              )}
              {/* A full-width button at the foot of the box (user request
                  2026-11-06), in place of a note under the price. */}
              {isHost ? (
                <button
                  className="glass-button full settle-change"
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
            </>
          )}
        </div>

        {settlement ? (
          <>
            <div className="settle-pays-head">
              <span className="label">Who pays whom</span>
              {lines.length ? (
                <span className={`settle-paid-count${paidCount === lines.length ? " done" : ""}`}>
                  {paidCount === lines.length
                    ? "All paid"
                    : `${paidCount} of ${lines.length} paid`}
                </span>
              ) : null}
            </div>
            {settlement.bank ? (
              <p className="muted small-note">
                {settlement.bank.name === BANK_NAME
                  ? "The host was the bank"
                  : `${settlement.bank.name} was the bank`}
                : {cash(settlement.bank.paidIn)} paid in and{" "}
                {cash(settlement.bank.paidOut)} paid out at the table are taken
                into account.
              </p>
            ) : null}
            {lines.length ? (
              <div className="rows">
                {lines.map((line) => {
                  const { transfer } = line;
                  const key = keyOf(line);
                  const paid = shownPaid(line);
                  const unsaved = draft.has(key);
                  return (
                    <div
                      className={`result-row payment-row${paid ? " paid" : ""}`}
                      key={key}
                    >
                      {paymentTarget ? (
                        <button
                          className="payment-tick"
                          type="button"
                          aria-pressed={Boolean(paid)}
                          aria-label={`${transfer.from} pays ${transfer.to}: ${
                            paid ? "paid, tap to undo" : "mark as paid"
                          }`}
                          disabled={savingTicks}
                          onClick={() => toggle(line)}
                        >
                          {paid ? <CheckIcon /> : null}
                        </button>
                      ) : null}
                      <span className="result-name">
                        {transfer.from} <span className="muted">pays</span>{" "}
                        {transfer.to}
                        {unsaved ? (
                          <small className="payment-unsaved">
                            {paid ? "Paid · not saved yet" : "Unticked · not saved yet"}
                          </small>
                        ) : line.paid ? (
                          <small>{paidNote(line.paid)}</small>
                        ) : null}
                      </span>
                      <span className="result-amount">{cash(transfer.cents)}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="muted small-note">Nobody owes anything.</p>
            )}
            {/* Always there when there are ticks to make; it works once a
                tick has changed (user request 2026-11-06). */}
            {paymentTarget && lines.length ? (
              <button
                className="primary full"
                type="button"
                disabled={!draft.size || savingTicks}
                onClick={() => void saveTicks()}
              >
                {savingTicks ? "Saving…" : "Save changes"}
              </button>
            ) : null}
            {/* Who pays whom as text, for the group chat. */}
            <button
              className={`${paymentTarget && lines.length ? "ghost" : "primary"} full`}
              type="button"
              disabled={editing}
              onClick={() => void share()}
            >
              {canShare ? "Share payments" : "Copy payments"}
            </button>
          </>
        ) : (
          <p className="field-error">
            This game&apos;s saved chips don&apos;t add up, so it can&apos;t be
            settled.
          </p>
        )}
        {confirmClose ? (
          <p className="field-error">
            {draft.size} change{draft.size === 1 ? " isn't" : "s aren't"} saved.
          </p>
        ) : null}
        <button
          className="ghost full"
          type="button"
          disabled={savingTicks}
          onClick={close}
        >
          {confirmClose ? "Close without saving" : "Done"}
        </button>
      </div>
    </div>
  );
}
