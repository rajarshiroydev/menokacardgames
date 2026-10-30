"use client";

import { useState } from "react";

import { Avatar } from "@/components/ledger/avatar";
import { Segmented } from "@/components/ledger/segmented";
import { RECENT_SIGN_IN_WINDOW_MS } from "@/lib/auth/recent-sign-in";

/** Extras for a confirmation asked through `ask`. */
export type AskOptions = { points?: string[]; danger?: boolean };

export type ModalState =
  | {
      kind: "confirm";
      message: string;
      /** Shown as a list under the message, for confirmations with several facts. */
      points?: string[];
      confirmLabel: string;
      /** Dismiss button text; defaults to "Cancel". */
      dismissLabel?: string;
      /** A notice with a single button, nothing to cancel. */
      hideDismiss?: boolean;
      danger?: boolean;
      onConfirm: () => void;
      /** A link under the message for another way to go on, such as a different amount. */
      alternative?: { label: string; onChoose: () => void };
      /**
       * Saving with rebuys nobody played with: Keep or Take back for each,
       * then `onSave` with the players whose rebuys are taken back.
       */
      rebuys?: {
        items: Array<{
          playerIndex: number;
          playerId?: string;
          name: string;
          amount: string;
          count: number;
        }>;
        onSave: (takeBack: number[]) => void;
      };
    }
  | {
      kind: "recent-sign-in";
      purpose: string;
      email: string;
      confirmLabel: string;
      onConfirm: () => void;
    };

export function Modal({
  state,
  onClose,
  onConfirm,
}: {
  state: ModalState;
  onClose: () => void;
  onConfirm: () => void;
}) {
  // Rebuys the host chose to take back (`rebuys`); every one is kept at first.
  const [takeBack, setTakeBack] = useState<number[]>([]);
  const rebuys = state.kind === "confirm" ? state.rebuys : undefined;

  function confirm() {
    if (rebuys) rebuys.onSave(takeBack);
    else state.onConfirm();
    onConfirm();
  }

  return (
    <div
      className="modal show"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Confirm action"
      >
        <div className="msg">
          {state.kind === "recent-sign-in" ? (
            <>
              For safety, {state.purpose} needs a sign-in from the last{" "}
              {RECENT_SIGN_IN_WINDOW_MS / 60_000} minutes. We will email a new
              sign-in link to{" "}
              <span className="literal-text">{state.email}</span>. Open it on
              this device, then try again.
            </>
          ) : state.points?.length ? (
            <>
              <p className="msg-title">{state.message}</p>
              <ul className="msg-points">
                {state.points.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            </>
          ) : (
            state.message
          )}
        </div>
        {rebuys ? (
          <div className="unplayed-rebuys">
            <div className="unplayed-rebuys-head">
              <b>{rebuys.items.length === 1 ? "Unused buy-in" : "Unused buy-ins"}</b>
              <p>
                {rebuys.items.length === 1
                  ? `${rebuys.items[0].name} hasn't finished a hand since buying back in. Taking the buy-in back removes it as if it never happened.`
                  : `${rebuys.items
                      .slice(0, -1)
                      .map((item) => item.name)
                      .join(", ")} and ${rebuys.items.at(-1)!.name} haven't finished a hand since buying back in. Taking a buy-in back removes it as if it never happened.`}
              </p>
            </div>
            {rebuys.items.map((item) => (
              <div className="unplayed-rebuy" key={item.playerIndex}>
                {/* Who and how much on one line, like a standings row; the
                    amount is what the choice is about, so it is the largest. */}
                <div className="unplayed-rebuy-who">
                  <Avatar name={item.name} playerId={item.playerId} size="small" />
                  <span className="unplayed-rebuy-name">
                    <b>{item.name}</b>
                    <small>
                      {item.count === 1 ? "Bought back in" : `Bought back in ${item.count} times`}
                    </small>
                  </span>
                  <strong className="unplayed-rebuy-amount">{item.amount}</strong>
                </div>
                <Segmented
                  label={`${item.name}'s buy-in`}
                  options={[
                    { value: "keep", label: "Keep" },
                    { value: "back", label: "Take back" },
                  ]}
                  value={takeBack.includes(item.playerIndex) ? "back" : "keep"}
                  onChange={(choice) =>
                    setTakeBack((current) =>
                      choice === "back"
                        ? [...current, item.playerIndex]
                        : current.filter((index) => index !== item.playerIndex),
                    )
                  }
                />
              </div>
            ))}
          </div>
        ) : null}
        {state.kind === "confirm" && state.alternative ? (
          <button
            className="text-button"
            type="button"
            onClick={() => {
              state.alternative?.onChoose();
              onConfirm();
            }}
          >
            {state.alternative.label}
          </button>
        ) : null}
        <button
          className={
            state.kind === "confirm" && state.danger ? "danger" : "primary"
          }
          onClick={confirm}
        >
          {state.confirmLabel}
        </button>
        {state.kind === "confirm" && state.hideDismiss ? null : (
          <button className="ghost" onClick={onClose}>
            {(state.kind === "confirm" && state.dismissLabel) || "Cancel"}
          </button>
        )}
      </div>
    </div>
  );
}
