"use client";

import { useContext } from "react";

import { AvatarArt } from "@/components/avatar-art";
import { SeatAvatar } from "@/components/game-parts";
import { AvatarContext } from "@/components/ledger/money";

// Named hues from the design; anyone else gets a stable hue from their name.
const PLAYER_HUES: Record<string, number> = {
  rajarshi: 150,
  debraj: 248,
  shubhankar: 195,
  abhirup: 300,
  pratik: 85,
  soham: 345,
  "rahul basak": 40,
  utsav: 170,
  ratan: 270,
};

export function playerColor(name: string) {
  const key = name.trim().toLowerCase();
  let hue = PLAYER_HUES[key];
  if (hue === undefined) {
    hue = 0;
    for (const char of key) hue = (hue * 31 + char.charCodeAt(0)) % 360;
  }
  return `oklch(0.78 0.15 ${hue})`;
}

export function toneClass(value: number | null) {
  return value === null || value === 0 ? "" : value > 0 ? "pos" : "neg";
}

export function Avatar({
  name,
  playerId,
  avatar,
  role,
  size = "large",
}: {
  name: string;
  playerId?: string;
  /** Overrides the lookup, for people outside the host's list. */
  avatar?: string;
  role?: string;
  size?: "large" | "small";
}) {
  const lookup = useContext(AvatarContext);
  return (
    <SeatAvatar
      art={<AvatarArt id={avatar ?? lookup(playerId, name)} seed={name} />}
      role={role}
      size={size}
    />
  );
}
