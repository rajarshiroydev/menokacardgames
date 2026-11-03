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
    kicker: "Play in the app",
    title: "Hand by hand",
    text: "Track every bet, fold and pot",
    suit: "♦",
  },
  {
    kind: "ledger",
    kicker: "Play with real chips",
    title: "Quick ledger",
    text: "Just buy-ins and the final count",
    suit: "♣",
  },
  {
    kind: "tournament",
    kicker: "Play to one winner",
    title: "Tournament",
    text: "Blinds go up, last one left wins",
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
