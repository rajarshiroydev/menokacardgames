"use client";

import { AvatarArt } from "@/components/avatar-art";
import { AVATARS } from "@/lib/avatars";

/**
 * A grid of avatars where tapping one only selects it; the form around it
 * saves the choice. (AvatarSheet on Profile saves on tap instead.)
 */
export function AvatarPicker({
  value,
  seed,
  disabled = false,
  onChange,
}: {
  value: string;
  seed: string;
  disabled?: boolean;
  onChange: (avatar: string) => void;
}) {
  return (
    <div className="avatar-grid" role="radiogroup" aria-label="Avatar">
      {AVATARS.map((avatar, index) => (
        <button
          key={avatar.id}
          type="button"
          role="radio"
          className={`avatar-choice${avatar.id === value ? " selected" : ""}`}
          aria-label={`Avatar ${index + 1}`}
          aria-checked={avatar.id === value}
          disabled={disabled}
          onClick={() => onChange(avatar.id)}
        >
          <AvatarArt id={avatar.id} seed={seed} />
        </button>
      ))}
    </div>
  );
}

/** A random avatar id, for a picker's starting choice. */
export function randomAvatarId() {
  return AVATARS[Math.floor(Math.random() * AVATARS.length)].id;
}
