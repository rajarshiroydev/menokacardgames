"use client";

import { FormEvent, useState } from "react";

import { ChipInput, useMoney } from "@/components/ledger/money";
import { rebuyRulesError, RebuyRulesFields } from "@/components/ledger/rebuy-rules";
import { describeRebuyRules } from "@/lib/poker/buy-ins";
import {
  bigBlindAtLevel,
  DEFAULT_BLIND_SCHEDULE,
  mostRebuysUsed,
  pendingBlindPlan,
  smallBlindFor,
  upcomingBigBlinds,
} from "@/lib/poker/game";
import { chipCurrency } from "@/lib/poker/money";
import type { BlindSchedule, GameState, RebuyRules } from "@/lib/poker/types";

export function RebuyEditor({
  game,
  onClose,
  onSave,
}: {
  game: GameState;
  onClose: () => void;
  onSave: (rules: RebuyRules) => void;
}) {
  const { money } = useMoney();
  const [rules, setRules] = useState<RebuyRules>(
    game.rebuyRules ?? { maxRebuys: null, closeAtBigBlind: null },
  );
  const closeOptions = upcomingBigBlinds(game);
  // Offer a closing point while one is set, so it can be switched off.
  const showClose =
    closeOptions.length > 0 || game.rebuyRules?.closeAtBigBlind != null;
  const effective: RebuyRules = {
    maxRebuys: rules.maxRebuys,
    closeAtBigBlind:
      showClose && rules.maxRebuys !== 0 ? rules.closeAtBigBlind : null,
  };
  const used = mostRebuysUsed(game);
  const error = rebuyRulesError(effective, used, null, money);
  const closedNow =
    effective.closeAtBigBlind !== null && game.ante >= effective.closeAtBigBlind;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!error) onSave(effective);
  }

  return (
    <div
      className="modal blind-editor-modal show"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <form
        className="sheet blind-editor-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rebuy-editor-title"
        onSubmit={submit}
      >
        <h2 id="rebuy-editor-title">Edit Rebuys</h2>
        <p className="muted rule-note">
          Each rebuy is the starting stack, {money(game.startStack)}. The big
          blind is {money(game.ante)} now. Changes apply to the next rebuy.
        </p>
        <span className="label">Rebuys per player</span>
        <RebuyRulesFields
          rules={rules}
          onChange={setRules}
          closeOptions={closeOptions}
          showClose={showClose}
          idPrefix="edit"
        />
        {error ? (
          <p className="field-error" role="alert">
            {error}
          </p>
        ) : (
          <p className="muted rule-note">
            {describeRebuyRules(effective, chipCurrency(game.currency, game.chipValue), game.chipUnit) ?? "Unlimited rebuys"}
            .{closedNow ? " Rebuys are closed from now on." : ""}
          </p>
        )}
        <button className="primary full" type="submit" disabled={Boolean(error)}>
          Save Rebuys
        </button>
        <button className="ghost full" type="button" onClick={onClose}>
          Cancel
        </button>
      </form>
    </div>
  );
}

export function BlindEditor({
  game,
  onClose,
  onSave,
}: {
  game: GameState;
  onClose: () => void;
  onSave: (schedule: BlindSchedule | null) => void;
}) {
  const { money } = useMoney();
  const pending = pendingBlindPlan(game);
  const initial = pending ? pending.schedule : (game.blinds ?? null);
  const defaults = initial ?? DEFAULT_BLIND_SCHEDULE;
  const [enabled, setEnabled] = useState(Boolean(initial));
  const [unit, setUnit] = useState<BlindSchedule["unit"]>(defaults.unit);
  const [every, setEvery] = useState(defaults.every);
  const [raiseType, setRaiseType] = useState<BlindSchedule["raiseType"]>(
    defaults.raiseType,
  );
  const [raiseBy, setRaiseBy] = useState(defaults.raiseBy);
  const valid =
    !enabled ||
    (Number.isSafeInteger(every) &&
      every >= 1 &&
      Number.isFinite(raiseBy) &&
      raiseBy > (raiseType === "multiply" ? 1 : 0) &&
      (raiseType === "multiply" || Number.isSafeInteger(raiseBy)));
  const schedule: BlindSchedule | null = enabled
    ? { unit, every, raiseType, raiseBy }
    : null;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (valid) onSave(schedule);
  }

  return (
    <div
      className="modal blind-editor-modal show"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <form
        className="sheet blind-editor-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="blind-editor-title"
        onSubmit={submit}
      >
        <h2 id="blind-editor-title">Edit Blind Plan</h2>
        <p className="muted rule-note">
          Current blinds:{" "}
          {money(smallBlindFor(game.ante, game.smallBlindRatio))}/
          {money(game.ante)}. {game.hand
            ? "This hand keeps its posted blinds. The new plan starts with the next dealt hand."
            : "The new plan starts with the next dealt hand."}
        </p>
        <div className="blind-toggle">
          <label htmlFor="edit-rising-blinds">Blinds Go Up</label>
          <input
            id="edit-rising-blinds"
            type="checkbox"
            checked={enabled}
            onChange={(event) => setEnabled(event.target.checked)}
          />
        </div>
        {enabled ? (
          <>
            <div className="row setup-row">
              <div>
                <label htmlFor="edit-blind-every">Raise Every</label>
                <input
                  id="edit-blind-every"
                  type="number"
                  min="1"
                  step="1"
                  value={every}
                  onChange={(event) => setEvery(Number(event.target.value))}
                />
              </div>
              <div>
                <label htmlFor="edit-blind-unit">Counted In</label>
                <select
                  className="select-control"
                  id="edit-blind-unit"
                  value={unit}
                  onChange={(event) =>
                    setUnit(event.target.value as BlindSchedule["unit"])
                  }
                >
                  <option value="hands">Hands</option>
                  <option value="minutes">Minutes</option>
                </select>
              </div>
            </div>
            <div className="row setup-row">
              <div>
                <label htmlFor="edit-blind-raise-type">Increase By</label>
                <select
                  className="select-control"
                  id="edit-blind-raise-type"
                  value={raiseType}
                  onChange={(event) => {
                    const nextType = event.target
                      .value as BlindSchedule["raiseType"];
                    setRaiseType(nextType);
                    setRaiseBy(nextType === "multiply" ? 2 : game.ante);
                  }}
                >
                  <option value="multiply">Multiply Big Blind</option>
                  <option value="add">Add To Big Blind</option>
                </select>
              </div>
              <div>
                <label htmlFor="edit-blind-raise-by">
                  {raiseType === "multiply" ? "Multiplier" : "Amount"}
                </label>
                {raiseType === "multiply" ? (
                  <input
                    id="edit-blind-raise-by"
                    type="number"
                    min="1.1"
                    step="0.1"
                    value={raiseBy}
                    onChange={(event) => setRaiseBy(Number(event.target.value))}
                  />
                ) : (
                  <ChipInput
                    id="edit-blind-raise-by"
                    value={raiseBy}
                    onChange={setRaiseBy}
                  />
                )}
              </div>
            </div>
            <p className="muted rule-note">
              {valid
                ? `Next levels: ${Array.from({ length: 4 }, (_, level) =>
                    money(bigBlindAtLevel(game.ante, schedule, level)),
                  ).join(", ")}. ${unit === "minutes" ? "The timer starts when you save." : "The hand count starts with the next hand."}`
                : "Enter a whole hand or minute interval and an increase that raises the big blind."}
            </p>
          </>
        ) : (
          <p className="muted rule-note">
            Blinds will stay at{" "}
            {money(smallBlindFor(game.ante, game.smallBlindRatio))}/
            {money(game.ante)} from the next hand onward.
          </p>
        )}
        <button className="primary full" type="submit" disabled={!valid}>
          Save Blind Plan
        </button>
        <button className="ghost full" type="button" onClick={onClose}>
          Cancel
        </button>
      </form>
    </div>
  );
}
