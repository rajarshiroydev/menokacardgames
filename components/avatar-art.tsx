import { useId } from "react";

import { avatarSpec, SKIN_TONES, type AvatarSpec } from "@/lib/avatars";

const INK = "#2a2320";

const HAIR_BACK: Record<"long" | "bob" | "pony", string> = {
  long: "M17 30 Q17 12 32 12 Q47 12 47 30 L49 52 Q40 47 32 47 Q24 47 15 52Z",
  bob: "M17 28 Q17 12 32 12 Q47 12 47 28 L47 42 Q32 45 17 42Z",
  pony: "M44 22 Q55 26 50 44 Q47 36 43 30Z",
};

const HAIR_FRONT: Record<Exclude<AvatarSpec["front"], "curly" | undefined>, string> = {
  short: "M19 28 Q19 13 32 13 Q45 13 45 28 Q42 20 32 19 Q24 19 19 28Z",
  fringe: "M19 27 Q20 14 32 14 Q44 14 45 27 Q38 19 26 21 Q22 23 19 27Z",
  spiky:
    "M19 26 L18 16 L24 19 L26 11 L31 17 L35 10 L38 17 L44 13 L44 20 L46 26 Q40 19 32 19 Q24 19 19 26Z",
  buzz: "M20 24 Q21 15 32 15 Q43 15 44 24 Q38 19 32 19 Q26 19 20 24Z",
  side: "M19 28 Q18 13 33 13 Q46 14 45 27 Q44 20 38 18 Q30 22 19 28Z",
};

const CURLS: Array<[number, number, number]> = [
  [20, 23, 5],
  [23, 17, 5],
  [28, 13.5, 5],
  [36, 13.5, 5],
  [41, 17, 5],
  [44, 23, 5],
  [32, 12, 5],
];

/** Draws one avatar. Unknown ids fall back to a stable pick from `seed`. */
export function AvatarArt({
  id,
  seed = "",
  size,
  className,
}: {
  id: string | null | undefined;
  seed?: string;
  size?: number;
  className?: string;
}) {
  const clip = useId();
  const avatar = avatarSpec(id, seed);
  const skin = SKIN_TONES[avatar.skin] ?? SKIN_TONES[0];
  const { hair } = avatar;
  const covered = Boolean(avatar.hijab);

  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <clipPath id={clip}>
          <circle cx="32" cy="32" r="32" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clip})`}>
        <rect width="64" height="64" fill={avatar.background} />
        {avatar.hijab ? (
          <path
            d="M15 32 Q15 9 32 9 Q49 9 49 32 L53 66 L11 66Z"
            fill={avatar.hijab}
          />
        ) : null}
        {avatar.back && avatar.back !== "bun" ? (
          <path d={HAIR_BACK[avatar.back]} fill={hair} />
        ) : null}
        {avatar.back === "bun" ? <circle cx="32" cy="11" r="6" fill={hair} /> : null}
        <path d="M10 66 Q12 48 32 47 Q52 48 54 66Z" fill={avatar.shirt} />
        {covered ? null : (
          <>
            <rect x="28" y="38" width="8" height="10" rx="3" fill={skin} />
            <circle cx="19.5" cy="31" r="2.6" fill={skin} />
            <circle cx="44.5" cy="31" r="2.6" fill={skin} />
          </>
        )}
        <ellipse cx="32" cy="29" rx="12.5" ry="13.5" fill={skin} />
        <ellipse cx="23.5" cy="34.5" rx="2.6" ry="1.6" fill="#ff7b8f" opacity=".35" />
        <ellipse cx="40.5" cy="34.5" rx="2.6" ry="1.6" fill="#ff7b8f" opacity=".35" />
        <ellipse cx="27" cy="30" rx="1.6" ry="2.2" fill={INK} />
        <ellipse cx="37" cy="30" rx="1.6" ry="2.2" fill={INK} />
        <path
          d="M24.5 25.6 q2.5 -1.4 5 0 M34.5 25.6 q2.5 -1.4 5 0"
          stroke="#3a2a22"
          strokeWidth="1.2"
          fill="none"
          strokeLinecap="round"
        />
        {avatar.smile === "open" ? (
          <>
            <path d="M26 35 Q32 43 38 35Z" fill="#7a2e2e" />
            <path
              d="M26.6 35.2 Q32 36.6 37.4 35.2 L37 36.2 Q32 37.6 27 36.2Z"
              fill="#fff"
            />
          </>
        ) : (
          <path
            d="M27.5 35.5 Q32 39.5 36.5 35.5"
            stroke="#5a2a20"
            strokeWidth="1.7"
            fill="none"
            strokeLinecap="round"
          />
        )}
        {avatar.front === "curly"
          ? CURLS.map(([cx, cy, r]) => (
              <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} fill={hair} />
            ))
          : avatar.front
            ? <path d={HAIR_FRONT[avatar.front]} fill={hair} />
            : null}
        {avatar.hijab ? (
          <>
            {/* The scarf over the forehead and wrapped under the chin. */}
            <path
              d="M19 27 Q19 14 32 14 Q45 14 45 27 Q41 18.5 32 18.5 Q23 18.5 19 27Z"
              fill={avatar.hijab}
            />
            <path
              d="M19.5 29 Q19.5 44 32 44.5 Q44.5 44 44.5 29 L49 32 Q48 51 32 52 Q16 51 15 32Z"
              fill={avatar.hijab}
            />
            <path
              d="M19.5 27 Q19 38 23 42 M44.5 27 Q45 38 41 42"
              stroke="#000"
              strokeOpacity=".12"
              strokeWidth="1.2"
              fill="none"
            />
          </>
        ) : null}
        {avatar.turban ? (
          <>
            <path
              d="M17.5 27 Q15 9 32 7.5 Q49 9 46.5 27 Q41 20 32 20.5 Q23 20 17.5 27Z"
              fill={avatar.turban}
            />
            <path
              d="M19 21 Q27 11 45 17 M18.5 25 Q30 14 46 22"
              stroke="#000"
              strokeOpacity=".18"
              strokeWidth="1.3"
              fill="none"
              strokeLinecap="round"
            />
            <path d="M27.5 20.8 L32 15.5 L36.5 20.8 Q32 19.6 27.5 20.8Z" fill="#000" fillOpacity=".15" />
          </>
        ) : null}
        {avatar.beard ? (
          <path
            d="M20 31 Q21 45 32 46 Q43 45 44 31 Q41 40 32 40 Q23 40 20 31Z"
            fill={hair}
          />
        ) : null}
        {avatar.glasses ? (
          <g fill="none" stroke={INK} strokeWidth="1.4">
            <circle cx="27" cy="30" r="4.2" />
            <circle cx="37" cy="30" r="4.2" />
            <path d="M31.2 30h1.6" />
          </g>
        ) : null}
        {avatar.cap ? (
          <>
            <path d="M18 23 Q19 10 32 10 Q45 10 46 23Z" fill={avatar.cap} />
            <path d="M32 22 L53 22 Q53 26 47 26 L32 24Z" fill={avatar.cap} opacity=".8" />
          </>
        ) : null}
        {avatar.band ? (
          <path
            d="M19.5 22 Q32 15 44.5 22"
            stroke={avatar.band}
            strokeWidth="3"
            fill="none"
            strokeLinecap="round"
          />
        ) : null}
      </g>
    </svg>
  );
}
