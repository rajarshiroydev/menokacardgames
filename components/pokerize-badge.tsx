"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

// The rim's eight white notches, every 45 degrees.
const NOTCHES = Array.from({ length: 8 }, (_, index) => index * 45);

// The bubble's widest, and the gap kept from the screen's edges.
const BUBBLE_WIDTH = 240;
const EDGE = 16;

type Spot = { x: number; y: number; below: boolean };

/**
 * The mark after a name for a player who has a Pokerize account (user
 * request 2026-10-26, like a verified tick): the top face of the logo's chip,
 * drawn small so it stays crisp at 14 px. Only for people inside the app;
 * the live link and results card never show it. A tap opens a bubble saying
 * who is on Pokerize, with an optional hint under it.
 */
export function PokerizeBadge({
  name,
  isMe = false,
  hint,
}: {
  name?: string;
  isMe?: boolean;
  /** A second line, such as how to add them as a friend. */
  hint?: string;
}) {
  const id = useId();
  const anchor = useRef<HTMLSpanElement>(null);
  const bubble = useRef<HTMLSpanElement>(null);
  const [spot, setSpot] = useState<Spot | null>(null);

  useEffect(() => {
    if (!spot) return;
    const close = () => setSpot(null);
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (anchor.current?.contains(target) || bubble.current?.contains(target)) return;
      close();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("keydown", escape);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("keydown", escape);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [spot]);

  function toggle() {
    if (spot || !anchor.current) {
      setSpot(null);
      return;
    }
    const box = anchor.current.getBoundingClientRect();
    // Centred on the badge, kept on screen; below it near the top.
    const half = Math.min(BUBBLE_WIDTH, window.innerWidth - EDGE * 2) / 2;
    const x = Math.min(
      Math.max(box.left + box.width / 2, EDGE + half),
      window.innerWidth - EDGE - half,
    );
    const below = box.top < 96;
    setSpot({ x, y: below ? box.bottom + 8 : box.top - 8, below });
  }

  const title = isMe
    ? "You're on Pokerize"
    : name
      ? `${name} is on Pokerize`
      : "On Pokerize";

  return (
    <span
      ref={anchor}
      className="pokerize-badge-hit"
      role="button"
      tabIndex={0}
      aria-label="On Pokerize"
      aria-expanded={spot !== null}
      aria-describedby={spot ? `${id}-bubble` : undefined}
      // Inside a standings card's button or a long-press row: the tap is
      // the badge's alone.
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        event.preventDefault();
        toggle();
      }}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.stopPropagation();
        event.preventDefault();
        toggle();
      }}
    >
      <svg className="pokerize-badge" viewBox="0 0 16 16" aria-hidden="true">
        <title>On Pokerize</title>
        <defs>
          <linearGradient id={`${id}-rim`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="oklch(0.84 0.2 152)" />
            <stop offset="1" stopColor="oklch(0.66 0.17 248)" />
          </linearGradient>
          <linearGradient id={`${id}-spade`} x1="0.3" y1="0" x2="0.7" y2="1">
            <stop offset="0.1" stopColor="oklch(0.97 0.05 152)" />
            <stop offset="0.55" stopColor="oklch(0.84 0.2 152)" />
            <stop offset="1" stopColor="oklch(0.74 0.16 246)" />
          </linearGradient>
        </defs>
        <circle cx="8" cy="8" r="8" fill={`url(#${id}-rim)`} />
        {NOTCHES.map((angle) => (
          <rect
            key={angle}
            x="7.1"
            y="0.2"
            width="1.8"
            height="2.4"
            rx="0.4"
            fill="rgba(255,255,255,.92)"
            transform={`rotate(${angle} 8 8)`}
          />
        ))}
        <circle cx="8" cy="8" r="5.1" fill="#071014" />
        <path
          fill={`url(#${id}-spade)`}
          d="M8 4.3 10.5 6.9a1.55 1.55 0 0 1-2.05 2.3l.65 1.6H6.9l.65-1.6A1.55 1.55 0 0 1 5.5 6.9Z"
        />
      </svg>
      {spot
        ? createPortal(
            <span
              ref={bubble}
              id={`${id}-bubble`}
              role="tooltip"
              className={`pokerize-bubble${spot.below ? " below" : ""}`}
              style={{ left: spot.x, top: spot.y, maxWidth: BUBBLE_WIDTH }}
            >
              <b>{title}</b>
              {hint ? <small>{hint}</small> : null}
            </span>,
            document.body,
          )
        : null}
    </span>
  );
}
