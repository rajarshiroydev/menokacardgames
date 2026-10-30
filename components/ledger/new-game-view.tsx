"use client";

/** The ways to record a game, offered as equals; tournaments come later. */
const GAME_KINDS: ReadonlyArray<{
  kind: "hands" | "ledger" | "tournament";
  kicker: string;
  title: string;
  text: string;
  suit: string;
}> = [
  {
    kind: "hands",
    kicker: "Blinds and bets",
    title: "Hand by hand",
    text: "Seat players, set stacks, deal",
    suit: "♦",
  },
  {
    kind: "ledger",
    kicker: "Just the money",
    title: "Quick ledger",
    text: "Buy-ins and cash-outs, then count the chips",
    suit: "♣",
  },
  {
    kind: "tournament",
    kicker: "Last one standing",
    title: "Tournament",
    text: "Rising blinds, play to a winner",
    suit: "♥",
  },
];

/** The choice of how to record a game, before its setup. */
export function NewGameView({
  onChoose,
}: {
  onChoose: (kind: "hands" | "ledger") => void;
}) {
  return (
    <section className="new-game-view">
      {GAME_KINDS.map((option) => {
        const { kind } = option;
        const soon = kind === "tournament";
        return (
          <button
            key={kind}
            className={`glass game-kind-card game-kind-${kind}`}
            type="button"
            disabled={soon}
            onClick={soon ? undefined : () => onChoose(kind)}
          >
            <span className="game-kind-watermark" aria-hidden="true">
              {option.suit}
            </span>
            <span className="game-kind-copy">
              <span className="game-kind-kicker">{option.kicker}</span>
              <strong>{option.title}</strong>
              <small>{option.text}</small>
            </span>
            {soon ? (
              <span className="game-kind-soon">Coming soon</span>
            ) : (
              <span className="game-kind-go" aria-hidden="true">
                {option.suit}
              </span>
            )}
          </button>
        );
      })}
    </section>
  );
}
