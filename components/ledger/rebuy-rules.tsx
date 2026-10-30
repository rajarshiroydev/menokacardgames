"use client";

import { useState } from "react";

import { InfinityIcon } from "@/components/ledger/icons";
import { ChipInput, useMoney } from "@/components/ledger/money";
import { Segmented } from "@/components/ledger/segmented";
import { MAX_REBUYS } from "@/lib/poker/buy-ins";
import type { RebuyRules } from "@/lib/poker/types";

type RebuyMaxChoice = "unlimited" | 0 | 1 | 2 | 3 | "other";
type RebuyCloseChoice = "never" | number | "other";

/**
 * Why these rebuy limits can't be used, or null. `rebuysMade` is the most
 * rebuys any player has already made; `closeAbove`, when set, is a big blind the
 * closing amount must be above (setup, where closing at once means none).
 */
export function rebuyRulesError(
  rules: RebuyRules,
  rebuysMade: number,
  closeAbove: number | null,
  money: (value: number) => string,
) {
  const { maxRebuys, closeAtBigBlind } = rules;
  if (
    maxRebuys !== null &&
    (!Number.isSafeInteger(maxRebuys) || maxRebuys < 0 || maxRebuys > MAX_REBUYS)
  ) {
    return `Allow from 0 to ${MAX_REBUYS} rebuys.`;
  }
  if (maxRebuys !== null && maxRebuys < rebuysMade) {
    return `A player has already rebought ${rebuysMade} time${
      rebuysMade === 1 ? "" : "s"
    }, so allow at least ${rebuysMade}.`;
  }
  if (
    closeAtBigBlind !== null &&
    (!Number.isSafeInteger(closeAtBigBlind) || closeAtBigBlind < 1)
  ) {
    return "Enter a big blind of at least 1.";
  }
  if (
    closeAtBigBlind !== null &&
    closeAbove !== null &&
    closeAtBigBlind <= closeAbove
  ) {
    return `Pick a big blind above ${money(closeAbove)}, or choose None rebuys.`;
  }
  return null;
}

/**
 * The two rebuy limits, used on setup and in Edit Rebuys. Closing amounts
 * are big blinds, so they stay right when the blind plan changes.
 */
export function RebuyRulesFields({
  rules,
  onChange,
  closeOptions,
  showClose,
  idPrefix,
}: {
  rules: RebuyRules;
  onChange: (rules: RebuyRules) => void;
  /** Upcoming big blinds offered as closing points. */
  closeOptions: number[];
  showClose: boolean;
  idPrefix: string;
}) {
  const { money } = useMoney();
  const [customMax, setCustomMax] = useState(
    rules.maxRebuys !== null && rules.maxRebuys > 3,
  );
  const [customClose, setCustomClose] = useState(
    rules.closeAtBigBlind !== null &&
      !closeOptions.includes(rules.closeAtBigBlind),
  );
  const offered = closeOptions.slice(0, 3);
  const maxValue: RebuyMaxChoice = customMax
    ? "other"
    : rules.maxRebuys === null
      ? "unlimited"
      : rules.maxRebuys <= 3
        ? (rules.maxRebuys as 0 | 1 | 2 | 3)
        : "other";
  const closeIsOther =
    customClose ||
    (rules.closeAtBigBlind !== null && !offered.includes(rules.closeAtBigBlind));
  const closeValue: RebuyCloseChoice = closeIsOther
    ? "other"
    : (rules.closeAtBigBlind ?? "never");

  return (
    <>
      <Segmented<RebuyMaxChoice>
        label="Rebuys per player"
        options={[
          // "No limit" doesn't fit six chips at 375px; the card note says it.
          { value: "unlimited", label: "No limit", icon: <InfinityIcon /> },
          { value: 0, label: "None" },
          { value: 1, label: "1" },
          { value: 2, label: "2" },
          { value: 3, label: "3" },
          { value: "other", label: "Other" },
        ]}
        value={maxValue}
        onChange={(value) => {
          if (value === "other") {
            setCustomMax(true);
            onChange({ ...rules, maxRebuys: Math.max(4, rules.maxRebuys ?? 4) });
            return;
          }
          setCustomMax(false);
          onChange({
            ...rules,
            maxRebuys: value === "unlimited" ? null : value,
          });
        }}
      />
      {maxValue === "other" ? (
        <input
          className="field"
          id={`${idPrefix}-max-rebuys`}
          aria-label="Rebuys per player"
          type="number"
          inputMode="numeric"
          min="0"
          max={MAX_REBUYS}
          value={rules.maxRebuys ?? ""}
          onChange={(event) =>
            onChange({ ...rules, maxRebuys: Number(event.target.value) })
          }
        />
      ) : null}
      {showClose && rules.maxRebuys !== 0 ? (
        <>
          <span className="label">Rebuys close at big blind</span>
          <Segmented<RebuyCloseChoice>
            label="Rebuys close at big blind"
            options={[
              { value: "never", label: "Never" },
              ...offered.map((amount) => ({
                value: amount,
                label: money(amount),
              })),
              { value: "other", label: "Other" },
            ]}
            value={closeValue}
            onChange={(value) => {
              if (value === "other") {
                setCustomClose(true);
                onChange({
                  ...rules,
                  closeAtBigBlind:
                    rules.closeAtBigBlind ?? closeOptions.at(-1) ?? null,
                });
                return;
              }
              setCustomClose(false);
              onChange({
                ...rules,
                closeAtBigBlind: value === "never" ? null : value,
              });
            }}
          />
          {closeValue === "other" ? (
            <ChipInput
              className="field"
              id={`${idPrefix}-close-at`}
              aria-label="Big blind at which rebuys close"
              value={rules.closeAtBigBlind}
              onChange={(closeAtBigBlind) =>
                onChange({ ...rules, closeAtBigBlind })
              }
            />
          ) : null}
        </>
      ) : null}
    </>
  );
}
