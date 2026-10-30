"use client";

import { ReactNode } from "react";

import type { View } from "@/components/ledger/views";

type TabTarget = "home" | "play" | "history" | "sessions" | "profile";

/** A head and shoulders, drawn at the size of the suit glyphs beside it. */
function ProfileIcon() {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
      <circle cx="8" cy="5" r="3.2" fill="currentColor" />
      <path d="M1.8 15a6.2 6.2 0 0 1 12.4 0Z" fill="currentColor" />
    </svg>
  );
}

const TABS: ReadonlyArray<{ target: TabTarget; icon: ReactNode; label: string }> = [
  { target: "home", icon: "♠", label: "Home" },
  { target: "play", icon: "♦", label: "Play" },
  { target: "history", icon: "♣", label: "Ranks" },
  { target: "sessions", icon: "♥", label: "Games" },
  { target: "profile", icon: <ProfileIcon />, label: "Profile" },
];

function tabForView(view: View): TabTarget {
  if (view === "newGame" || view === "setup" || view === "game") return "play";
  if (view === "hands" || view === "whoWins") return "home";
  if (view === "settings") return "profile";
  return view;
}

export function TabBar({
  view,
  dots,
  onSelect,
}: {
  view: View;
  /** A game is on (Play), or friend requests are waiting (Profile). */
  dots: Partial<Record<TabTarget, boolean>>;
  onSelect: (target: TabTarget) => void;
}) {
  const active = tabForView(view);
  return (
    <nav className="tab-bar" aria-label="Main">
      {TABS.map((tab) => (
        <button
          key={tab.target}
          type="button"
          className={tab.target === active ? "active" : ""}
          aria-current={tab.target === active ? "page" : undefined}
          onClick={() => onSelect(tab.target)}
        >
          <span className="tab-icon" aria-hidden="true">
            {tab.icon}
          </span>
          <span className="tab-label">{tab.label}</span>
          <span className="tab-indicator" aria-hidden="true" />
          {dots[tab.target] ? (
            <span className={`tab-dot tab-dot-${tab.target}`} aria-hidden="true" />
          ) : null}
        </button>
      ))}
    </nav>
  );
}
