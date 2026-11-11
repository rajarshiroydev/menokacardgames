"use client";

import { type FormEvent, useState } from "react";
import { createPortal } from "react-dom";

import { useMoney } from "@/components/ledger/money";
import {
  CHIP_COLOUR_NAMES,
  CHIP_COLOURS,
  type ChipColour,
  type ChipSet,
  chipsForUnit,
  countedStack,
  MAX_CHIP_COLOURS,
  readChipSet,
  STARTER_CHIP_SET,
} from "@/lib/poker/chip-set";
import { chipsToInput, parseChips } from "@/lib/poker/money";

/** How many chips of each colour are in one player's stack. */
export type ColourCounts = Partial<Record<ChipColour, number>>;

/** Saves the host's chip set; resolves false after showing why it failed. */
export type SaveChipSet = (chipSet: ChipSet) => Promise<boolean>;

/** A round chip in one of the set's colours. */
export function ChipSwatch({ colour }: { colour: ChipColour }) {
  return <span className={`chip-swatch chip-${colour}`} aria-hidden="true" />;
}

/**
 * Counts one player's stack colour by colour (plan entry "count chips by
 * colour (plan)"). With no chip set yet it opens on the editor, starting from
 * a common set. `onUse` gets the total in the game's chips and the counts,
 * so reopening the sheet shows them again.
 */
export function ChipCountSheet({
  name,
  chipSet,
  initialCounts,
  onSaveChipSet,
  onUse,
  onClose,
}: {
  name: string;
  chipSet: ChipSet | null;
  initialCounts?: ColourCounts;
  onSaveChipSet: SaveChipSet;
  onUse: (chips: number, counts: ColourCounts) => void;
  onClose: () => void;
}) {
  const { money, unit } = useMoney();
  const [editing, setEditing] = useState(!chipSet);
  const [counts, setCounts] = useState<ColourCounts>(initialCounts ?? {});
  const chips = chipSet ? chipsForUnit(chipSet, unit) : [];
  const hidden = chipSet ? chipSet.length - chips.length : 0;
  const total = countedStack(chips, counts);

  function setCount(colour: ChipColour, count: number) {
    setCounts((current) => ({ ...current, [colour]: Math.max(0, count) }));
  }

  return createPortal(
    <div
      className="modal show chip-modal"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      {editing ? (
        <ChipSetEditorBody
          chipSet={chipSet}
          intro={
            chipSet
              ? null
              : "Set up your chips once: their colours and what each is worth. They're kept with your account for every game."
          }
          onSave={async (next) => {
            if (!(await onSaveChipSet(next))) return;
            setEditing(false);
          }}
          onCancel={() => (chipSet ? setEditing(false) : onClose())}
        />
      ) : (
        <div
          className="sheet profile-sheet chip-sheet"
          role="dialog"
          aria-modal="true"
          aria-labelledby="chip-count-title"
        >
          <span className="sheet-grabber" aria-hidden="true" />
          <h2 id="chip-count-title">Count {name}&apos;s Chips</h2>
          {chips.length ? (
            <div className="chip-count-list">
              {chips.map((chip) => {
                const count = counts[chip.colour] ?? 0;
                const label = CHIP_COLOUR_NAMES[chip.colour];
                return (
                  <div className="chip-count-line" key={chip.colour}>
                    <ChipSwatch colour={chip.colour} />
                    <span className="chip-count-name">
                      <b>{label}</b>
                      <small>{money(chip.chips)}</small>
                    </span>
                    <div className="chip-stepper">
                      <button
                        type="button"
                        aria-label={`One ${label.toLowerCase()} less`}
                        disabled={!count}
                        onClick={() => setCount(chip.colour, count - 1)}
                      >
                        −
                      </button>
                      <input
                        type="text"
                        inputMode="numeric"
                        autoComplete="off"
                        aria-label={`${label} chips`}
                        placeholder="0"
                        value={count ? String(count) : ""}
                        onChange={(event) => {
                          const typed = event.target.value.replace(/\D/g, "").slice(0, 5);
                          setCount(chip.colour, Number(typed || "0"));
                        }}
                      />
                      <button
                        type="button"
                        aria-label={`One ${label.toLowerCase()} more`}
                        onClick={() => setCount(chip.colour, count + 1)}
                      >
                        +
                      </button>
                    </div>
                    <span className="chip-count-sum">
                      {count ? money(count * chip.chips) : ""}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="muted small-note">
              None of your chips can be used in this game: each is worth less than one
              chip here. Edit your chips to add whole values.
            </p>
          )}
          {hidden && chips.length ? (
            <p className="muted small-note">
              Chips worth less than one chip in this game aren&apos;t listed.
            </p>
          ) : null}
          <div className="chip-count-total" role="status">
            <span>Total</span>
            <b>{money(total)}</b>
          </div>
          <button
            className="primary full"
            type="button"
            disabled={!chips.length}
            onClick={() => onUse(total, counts)}
          >
            Use {money(total)}
          </button>
          <div className="button-pair">
            <button className="ghost" type="button" onClick={() => setEditing(true)}>
              Edit chips
            </button>
            <button className="ghost" type="button" onClick={onClose}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}

/** The chip set editor on its own, opened from Profile. */
export function ChipSetSheet({
  chipSet,
  onSave,
  onClose,
}: {
  chipSet: ChipSet | null;
  onSave: SaveChipSet;
  onClose: () => void;
}) {
  return createPortal(
    <div
      className="modal show chip-modal"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <ChipSetEditorBody
        chipSet={chipSet}
        intro="The colours of your chips and what each is worth, for counting a stack colour by colour at the end of a quick ledger."
        onSave={async (next) => {
          if (await onSave(next)) onClose();
        }}
        onCancel={onClose}
      />
    </div>,
    document.body,
  );
}

type Draft = { key: number; colour: ChipColour; value: string };

function ChipSetEditorBody({
  chipSet,
  intro,
  onSave,
  onCancel,
}: {
  chipSet: ChipSet | null;
  intro: string | null;
  onSave: (chipSet: ChipSet) => Promise<void>;
  onCancel: () => void;
}) {
  // Values are typed as the game shows them ("500", "0.25"), kept in hundredths.
  const [rows, setRows] = useState<Draft[]>(() =>
    (chipSet ?? STARTER_CHIP_SET).map((chip, key) => ({
      key,
      colour: chip.colour,
      value: chipsToInput(chip.value, "cents"),
    })),
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const unused = CHIP_COLOURS.filter((colour) => !rows.some((row) => row.colour === colour));

  function update(key: number, change: Partial<Draft>) {
    setError(null);
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...change } : row)));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const read = readChipSet(
      rows.map((row) => ({
        colour: row.colour,
        value: parseChips(row.value, "cents") ?? 0,
      })),
    );
    if ("error" in read) {
      setError(read.error);
      return;
    }
    setSaving(true);
    await onSave(read.chipSet);
    setSaving(false);
  }

  return (
    <form
      className="sheet profile-sheet chip-sheet"
      role="dialog"
      aria-modal="true"
      aria-labelledby="chip-set-title"
      onSubmit={(event) => void submit(event)}
    >
      <span className="sheet-grabber" aria-hidden="true" />
      <h2 id="chip-set-title">Your Chips</h2>
      {intro ? <p className="muted small-note">{intro}</p> : null}
      <div className="chip-count-list">
        {rows.map((row) => (
          <div className="chip-edit-line" key={row.key}>
            <ChipSwatch colour={row.colour} />
            <select
              className="select-control"
              aria-label="Colour"
              value={row.colour}
              onChange={(event) => update(row.key, { colour: event.target.value as ChipColour })}
            >
              {CHIP_COLOURS.filter(
                (colour) => colour === row.colour || unused.includes(colour),
              ).map((colour) => (
                <option key={colour} value={colour}>
                  {CHIP_COLOUR_NAMES[colour]}
                </option>
              ))}
            </select>
            <input
              className="field"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              aria-label={`${CHIP_COLOUR_NAMES[row.colour]} chip value`}
              placeholder="Value"
              value={row.value}
              onChange={(event) => update(row.key, { value: event.target.value })}
            />
            <button
              className="chip-remove"
              type="button"
              aria-label={`Remove ${CHIP_COLOUR_NAMES[row.colour].toLowerCase()}`}
              disabled={rows.length === 1}
              onClick={() => {
                setError(null);
                setRows((current) => current.filter((item) => item.key !== row.key));
              }}
            >
              ×
            </button>
          </div>
        ))}
      </div>
      {rows.length < MAX_CHIP_COLOURS && unused.length ? (
        <button
          className="glass-button full"
          type="button"
          onClick={() =>
            setRows((current) => [
              ...current,
              {
                key: Math.max(-1, ...current.map((row) => row.key)) + 1,
                colour: unused[0],
                value: "",
              },
            ])
          }
        >
          Add colour
        </button>
      ) : null}
      <p className="muted small-note">
        Values are in the game&apos;s chips: with a chip price set, a chip count, not
        money.
      </p>
      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : null}
      <button className="primary full" type="submit" disabled={saving}>
        {saving ? "Saving…" : "Save chips"}
      </button>
      <button className="ghost full" type="button" onClick={onCancel}>
        Cancel
      </button>
    </form>
  );
}
