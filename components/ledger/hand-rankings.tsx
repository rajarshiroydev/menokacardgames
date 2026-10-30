"use client";

const HAND_RANKINGS = [
  ["Royal Flush", "A, K, Q, J, 10, all one suit", "A♠ K♠ Q♠ J♠ 10♠", 5],
  ["Straight Flush", "Five in a row, same suit", "9♥ 8♥ 7♥ 6♥ 5♥", 5],
  ["Four of a Kind", "Four cards of one rank", "Q♣ Q♦ Q♥ Q♠ 7♦", 4],
  ["Full House", "Three of a kind plus a pair", "K♠ K♥ K♦ 4♣ 4♠", 5],
  ["Flush", "Any five cards of one suit", "A♦ J♦ 8♦ 6♦ 2♦", 5],
  ["Straight", "Five in a row, mixed suits", "10♣ 9♦ 8♠ 7♥ 6♣", 5],
  ["Three of a Kind", "Three cards of one rank", "7♠ 7♥ 7♦ K♣ 3♠", 3],
  ["Two Pair", "Two different pairs", "J♥ J♣ 5♠ 5♦ A♥", 4],
  ["One Pair", "Two cards of one rank", "10♦ 10♠ K♥ 6♣ 2♠", 2],
  ["High Card", "Nothing made; the highest card plays", "A♣ Q♦ 9♠ 5♥ 3♣", 1],
] as const;

export function PokerHandsChart() {
  return (
    <div className="stack-list hand-rankings">
      {HAND_RANKINGS.map(([name, description, cards, used], index) => (
        <section className="glass card hand-rank" key={name}>
          <div className="hand-rank-head">
            <span className={`hand-rank-number ${index < 3 ? "top" : ""}`}>
              {String(index + 1).padStart(2, "0")}
            </span>
            <div>
              <h2 className="card-title">{name}</h2>
              <p className="muted">{description}</p>
            </div>
          </div>
          <div className="mini-cards" aria-label={cards}>
            {cards.split(" ").map((card, cardIndex) => {
              const suit = card.slice(-1);
              return (
                <span
                  className={`mini-card ${suit === "♥" || suit === "♦" ? "red" : ""} ${
                    cardIndex < used ? "" : "unused"
                  }`}
                  key={card}
                  aria-hidden="true"
                >
                  <span>{card.slice(0, -1)}</span>
                  <span className="mini-card-suit">{suit}</span>
                </span>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
