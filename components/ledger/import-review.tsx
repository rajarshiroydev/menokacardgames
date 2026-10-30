"use client";

import { useState } from "react";

import { useMoney } from "@/components/ledger/money";
import { formatDate } from "@/lib/poker/game";
import type { ImportPlan, ImportPlayerMapping } from "@/lib/poker/import-plan";
import { chipCurrency, formatChips } from "@/lib/poker/money";
import type { PokerSession } from "@/lib/poker/types";

export function LegacySessionReview({
  sessions,
  onAdopt,
  onClose,
}: {
  sessions: PokerSession[];
  onAdopt: (selectedIds: Set<string>) => Promise<void>;
  onClose: () => void;
}) {
  const { currency } = useMoney();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);

  function toggleSession(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function adoptSelected() {
    if (!selectedIds.size || submitting) return;
    setSubmitting(true);
    try {
      await onAdopt(selectedIds);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal legacy-review-modal show" role="presentation">
      <div
        className="sheet legacy-review-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="legacy-review-title"
      >
        <div className="legacy-review-heading">
          <span className="legacy-data-kicker">Unassigned Device Data</span>
          <h2 id="legacy-review-title">Choose Sessions For This Account</h2>
          <p>
            Review the date, players and stakes. Only checked sessions will be
            added; unchecked sessions remain unassigned on this device.
          </p>
        </div>

        <div className="legacy-session-list">
          {sessions.map((session) => (
            <label className="legacy-session-option" key={session.id}>
              <input
                type="checkbox"
                checked={selectedIds.has(session.id)}
                onChange={() => toggleSession(session.id)}
              />
              <span>
                <strong>{session.name || "Saved Game"}</strong>
                <small>
                  {formatDate(session.date)} · Big Blind{" "}
                  {formatChips(session.ante, session.chipUnit, currency)}
                  {" · "}
                  {session.results.map((result) => result.name).join(", ")}
                </small>
              </span>
            </label>
          ))}
        </div>

        <div className="legacy-review-actions">
          <button
            className="ghost"
            type="button"
            disabled={submitting}
            onClick={onClose}
          >
            Leave Unassigned
          </button>
          <button
            className="primary"
            type="button"
            disabled={!selectedIds.size || submitting}
            onClick={() => void adoptSelected()}
          >
            {submitting
              ? "Adding…"
              : `Add ${selectedIds.size || "Selected"} To This Account`}
          </button>
        </div>
      </div>
    </div>
  );
}

function importMappingNote(mapping: ImportPlayerMapping) {
  switch (mapping.kind) {
    case "existing":
      return mapping.player.name === mapping.fileName
        ? "Your player"
        : `Your player ${mapping.player.name}`;
    case "discarded":
      return `Your discarded player ${mapping.player.name}; stays discarded`;
    case "new":
      return "New player; will be added to your list";
    case "unknown-record":
      return "Player record from another ledger; can't be imported";
  }
}

export function ImportReview({
  plan,
  onConfirm,
  onClose,
}: {
  plan: ImportPlan;
  onConfirm: (plan: ImportPlan) => Promise<void>;
  onClose: () => void;
}) {
  const { currency } = useMoney();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const count = plan.additions.length;
  const skipped = [
    plan.alreadySaved
      ? `${plan.alreadySaved} already in your ledger`
      : null,
    plan.duplicatesInFile
      ? `${plan.duplicatesInFile} repeated in the file`
      : null,
    plan.unreadable ? `${plan.unreadable} unreadable` : null,
  ].filter(Boolean);
  const newPlayers = plan.players.filter((mapping) => mapping.kind === "new");

  async function confirm() {
    if (submitting || plan.blocked) return;
    setSubmitting(true);
    setError("");
    try {
      await onConfirm(plan);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Import failed");
      setSubmitting(false);
    }
  }

  return (
    <div className="modal legacy-review-modal show" role="presentation">
      <div
        className="sheet legacy-review-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-review-title"
      >
        <div className="legacy-review-heading">
          <span className="legacy-data-kicker">Import Backup</span>
          <h2 id="import-review-title">
            {count} New Game{count === 1 ? "" : "s"} To Add
          </h2>
          <p>
            Check how each player in the file matches your list before
            anything is saved.
            {skipped.length ? ` Skipped: ${skipped.join(", ")}.` : ""}
          </p>
        </div>

        <div className="legacy-session-list import-review-list">
          <h3 className="import-review-subhead">
            Players ({plan.players.length}
            {newPlayers.length ? `, ${newPlayers.length} new` : ""})
          </h3>
          {plan.players.map((mapping) => (
            <div
              className={`legacy-session-option import-mapping import-mapping-${mapping.kind}`}
              key={`${mapping.kind}:${mapping.fileName}:${"player" in mapping ? mapping.player.id : ""}`}
            >
              <span>
                <strong>{mapping.fileName}</strong>
                <small>
                  {importMappingNote(mapping)} · {mapping.games} game
                  {mapping.games === 1 ? "" : "s"}
                </small>
              </span>
            </div>
          ))}

          <h3 className="import-review-subhead">Games</h3>
          {plan.additions.map((session) => (
            <div className="legacy-session-option import-mapping" key={session.id}>
              <span>
                <strong>{session.name || "Saved Game"}</strong>
                <small>
                  {formatDate(session.date)} ·{" "}
                  {session.kind === "ledger"
                    ? "Quick ledger"
                    : `Big Blind ${formatChips(session.ante, session.chipUnit, chipCurrency(currency, session.chipValue))}`}
                  {" · "}
                  {session.results.map((result) => result.name).join(", ")}
                </small>
              </span>
            </div>
          ))}
        </div>

        {plan.blocked ? (
          <p className="import-review-error" role="alert">
            This file has player records from another host&apos;s ledger, so
            it can&apos;t be imported here. Nothing will be added.
          </p>
        ) : null}
        {error ? (
          <p className="import-review-error" role="alert">
            {error}
          </p>
        ) : null}

        <div className="legacy-review-actions">
          <button
            className="ghost"
            type="button"
            disabled={submitting}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="primary"
            type="button"
            disabled={plan.blocked || submitting}
            onClick={() => void confirm()}
          >
            {submitting
              ? "Adding…"
              : `Add ${count} Game${count === 1 ? "" : "s"}`}
          </button>
        </div>
      </div>
    </div>
  );
}
