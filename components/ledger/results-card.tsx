"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { ShareIcon } from "@/components/ledger/icons";
import { APP_NAME } from "@/lib/brand";
import type { PokerSession } from "@/lib/poker/types";

const CARD_SHARE_TEXT = `Scored with ${APP_NAME} · https://pokerize.app`;
/** A loaded card is reused this long, so renames still show up the same day. */
const CARD_CACHE_MS = 30 * 60_000;
/** A card request that hasn't finished by then is dropped and tried again. */
const CARD_TIMEOUT_MS = 20_000;

/**
 * Results card pictures (drawn by the server, see app/api/sessions/[id]/card),
 * kept for this page so a preview opens at once. Keyed by the game's results:
 * a continued game saved again gets a new picture.
 */
const resultsCards = new Map<string, { file: Promise<File>; at: number }>();

function resultsCardKey(session: PokerSession) {
  return [
    session.id,
    session.ended,
    ...session.results.map((result) => `${result.playerId ?? result.name}=${result.net}`),
  ].join("|");
}

/** Starts the made-up id of a game at a friend's table (groupGameSession). */
export const FRIEND_GAME_PREFIX = "friend:";

/**
 * Where a game's card is drawn, up to its time zone: the host's own games by
 * id, a friend's game by host and start time (the phone has no game IDs).
 */
function resultsCardPath(session: PokerSession) {
  if (session.id.startsWith(FRIEND_GAME_PREFIX)) {
    const [host, date] = session.id.slice(FRIEND_GAME_PREFIX.length).split(":");
    return `/api/groups/card?host=${encodeURIComponent(host)}&date=${encodeURIComponent(date)}&tz=`;
  }
  return `/api/sessions/${encodeURIComponent(session.id)}/card?tz=`;
}

/**
 * A card the server refused: a missing game, chips that don't add up, or the
 * account's card limit (429, with the server's message and wait).
 */
class CardRefused extends Error {
  constructor(
    readonly status: number,
    readonly serverMessage: string | null,
    readonly retryAfterSeconds: number,
  ) {
    super(`card ${status}`);
  }
}

async function fetchResultsCard(session: PokerSession): Promise<File> {
  let timeZone = "";
  try {
    timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    // The server falls back to India time.
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CARD_TIMEOUT_MS);
  try {
    const response = await fetch(
      `${resultsCardPath(session)}${encodeURIComponent(timeZone)}`,
      { cache: "no-store", signal: controller.signal },
    );
    if (response.status >= 400 && response.status < 500) {
      const body = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      throw new CardRefused(
        response.status,
        body?.error ?? null,
        Number(response.headers.get("Retry-After")) || 60,
      );
    }
    if (!response.ok) throw new Error(`card ${response.status}`);
    const blob = await response.blob();
    const name =
      /filename="([^"]+)"/.exec(
        response.headers.get("Content-Disposition") ?? "",
      )?.[1] ?? "results.png";
    return new File([blob], name, { type: "image/png" });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The game's card, from this page's store or the server. A request that
 * fails or stalls (a phone network, a server waking up) is tried once more
 * before giving up; a refusal isn't.
 */
function loadResultsCard(session: PokerSession): Promise<File> {
  const key = resultsCardKey(session);
  const cached = resultsCards.get(key);
  if (cached && Date.now() - cached.at < CARD_CACHE_MS) return cached.file;
  const file = fetchResultsCard(session).catch(async (error) => {
    if (error instanceof CardRefused) throw error;
    await new Promise((resolve) => setTimeout(resolve, 500));
    return fetchResultsCard(session);
  });
  resultsCards.set(key, { file, at: Date.now() });
  file.catch(() => {
    if (resultsCards.get(key)?.file === file) resultsCards.delete(key);
  });
  return file;
}

let prefetchQueue: Promise<unknown> = Promise.resolve();
/** Once the account's card limit is reached, nothing is preloaded until then. */
let prefetchPausedUntil = 0;

/**
 * Loads a card in the background, ready for a tap, one card at a time so a
 * list of games doesn't load them all at once. Failures wait for the tap.
 */
export function prefetchResultsCard(session: PokerSession) {
  prefetchQueue = prefetchQueue.then(() => {
    if (Date.now() < prefetchPausedUntil) return undefined;
    return loadResultsCard(session).catch((error) => {
      if (error instanceof CardRefused && error.status === 429) {
        prefetchPausedUntil = Date.now() + error.retryAfterSeconds * 1000;
      }
    });
  });
}

function canShareFile(file: File) {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.canShare === "function" &&
    navigator.canShare({ files: [file] })
  );
}

function saveFile(file: File) {
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function sessionTitle(session: PokerSession) {
  return session.name || `Game ${session.sessionNumber ?? ""}`.trim();
}

/** Opens the game's results card, to look at and then share. */
export function ShareResultsButton({
  session,
  className,
  label,
}: {
  session: PokerSession;
  className: string;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Load the card once its game is on screen, so the preview is usually
  // ready by the time Share is tapped.
  useEffect(() => {
    const button = buttonRef.current;
    if (!button || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        observer.disconnect();
        prefetchResultsCard(session);
      }
    });
    observer.observe(button);
    return () => observer.disconnect();
  }, [session]);

  return (
    <>
      <button
        ref={buttonRef}
        className={className}
        type="button"
        onClick={() => setOpen(true)}
      >
        <ShareIcon />
        {label}
      </button>
      {/* On the body: a game card's glass would otherwise hold the sheet. */}
      {open
        ? createPortal(
            <ResultsCardSheet session={session} onClose={() => setOpen(false)} />,
            document.body,
          )
        : null}
    </>
  );
}

/**
 * A game's results card, shown before sharing. Share is only offered once
 * the picture has loaded: iOS Safari refuses to share once a tap has waited
 * on the network.
 */
function ResultsCardSheet({
  session,
  onClose,
}: {
  session: PokerSession;
  onClose: () => void;
}) {
  const [card, setCard] = useState<{ file: File; url: string } | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const title = sessionTitle(session);

  useEffect(() => {
    let cancelled = false;
    let url: string | null = null;
    loadResultsCard(session)
      .then((file) => {
        if (cancelled) return;
        url = URL.createObjectURL(file);
        setCard({ file, url });
      })
      .catch((error) => {
        if (cancelled) return;
        // A reached limit says so; any other failure keeps the plain message.
        setFailure(
          error instanceof CardRefused && error.status === 429 && error.serverMessage
            ? error.serverMessage
            : "Couldn't make the card.",
        );
      });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [session, attempt]);

  const shareable = card !== null && canShareFile(card.file);

  async function share() {
    if (!card) return;
    if (!shareable) {
      saveFile(card.file);
      return;
    }
    try {
      await navigator.share({
        files: [card.file],
        title,
        text: CARD_SHARE_TEXT,
      });
    } catch {
      // The host closed the share menu.
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
        className="sheet results-card-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="results-card-title"
      >
        <h2 id="results-card-title">Results Card</h2>
        <div className="results-card-frame">
          {card ? (
            // A plain <img>: it's a local blob, so next/image adds nothing.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={card.url} alt={`Results card for ${title}`} />
          ) : failure ? (
            <p className="field-error">{failure}</p>
          ) : (
            <p className="muted">Making the card…</p>
          )}
        </div>
        {failure ? (
          <button
            className="primary full"
            type="button"
            onClick={() => {
              setFailure(null);
              setAttempt((count) => count + 1);
            }}
          >
            Try again
          </button>
        ) : (
          <button
            className="primary full"
            type="button"
            disabled={!card}
            onClick={() => void share()}
          >
            {card && !shareable ? "Save image" : "Share image"}
          </button>
        )}
        <button className="ghost full" type="button" onClick={onClose}>
          Done
        </button>
      </div>
    </div>
  );
}
