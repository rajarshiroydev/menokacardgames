/**
 * The avatars players choose from: 20 hand-picked faces in DiceBear's
 * "Lorelei" style (CC0, so no credit line is needed). Each one is a static
 * file, `public/avatars/<id>.svg`, made by `npm run avatars:generate` from
 * the settings below; the app never calls an image service.
 *
 * Each avatar's id is stored in `accounts.avatar` and `players.avatar`
 * (migration 0015), so an id must never be removed. Changing an entry
 * changes that face for everyone who has it. New avatars get new ids; the
 * database picks defaults only from the ids that existed when the migration
 * ran (`public.random_avatar()`).
 */

export type AvatarSpec = {
  id: string;
  /** About 3 in 4 poker players are men, so 15 of the 20 faces are. */
  look: "male" | "female";
  /** Lorelei part variants, for example "variant04". */
  hair: string;
  /** Index into SKIN_TONES. */
  skin: number;
  hairColor: string;
  beard?: string;
  /** Set for male faces: plain eyes and a closed or grinning smile read as male. */
  eyes?: string;
  mouth?: string;
  glasses?: string;
  earrings?: string;
  flowers?: string;
  background: string;
};

export const SKIN_TONES = [
  "#f6d7c3",
  "#eec1a0",
  "#d9a27b",
  "#b97c57",
  "#8d5a3b",
  "#5e3b28",
] as const;

export const HAIR_COLORS = {
  black: "#1a1a1a",
  dark: "#2b1d16",
  brown: "#6b4226",
  auburn: "#a0522d",
  red: "#c2412d",
  blond: "#e0b25c",
  grey: "#9a9a9a",
  blue: "#3a7bd5",
  purple: "#8e6cdf",
  pink: "#e85d75",
  teal: "#16a085",
  orange: "#f2994a",
} as const;

const C = HAIR_COLORS;

export const AVATARS: readonly AvatarSpec[] = [
  { id: "p01", look: "male", hair: "variant01", skin: 3, hairColor: C.black, eyes: "variant24", mouth: "happy01", background: "#cfe8ff" },
  { id: "p02", look: "male", hair: "variant04", skin: 0, hairColor: C.blue, eyes: "variant12", mouth: "happy02", background: "#ffd9e2" },
  { id: "p03", look: "female", hair: "variant48", skin: 2, hairColor: C.pink, earrings: C.orange, background: "#fff1c2" },
  { id: "p04", look: "male", hair: "variant27", skin: 4, hairColor: C.orange, eyes: "variant16", mouth: "happy04", background: "#d6f5e3" },
  { id: "p05", look: "male", hair: "variant06", skin: 1, hairColor: C.brown, beard: "variant02", eyes: "variant08", mouth: "happy09", background: "#e8dcff" },
  { id: "p06", look: "male", hair: "variant39", skin: 5, hairColor: C.dark, eyes: "variant06", mouth: "happy13", background: "#ffe0c7" },
  { id: "p07", look: "male", hair: "variant08", skin: 2, hairColor: C.teal, glasses: C.blue, eyes: "variant13", mouth: "happy01", background: "#d9f2f7" },
  { id: "p08", look: "female", hair: "variant26", skin: 4, hairColor: C.purple, flowers: C.pink, background: "#fde2b8" },
  { id: "p09", look: "male", hair: "variant02", skin: 0, hairColor: C.red, beard: "variant01", eyes: "variant04", mouth: "happy03", background: "#e4ecf2" },
  { id: "p10", look: "male", hair: "variant20", skin: 3, hairColor: C.purple, eyes: "variant10", mouth: "happy04", background: "#ffd6cc" },
  { id: "p11", look: "male", hair: "variant47", skin: 5, hairColor: C.black, eyes: "variant24", mouth: "happy09", background: "#fff3b0" },
  { id: "p12", look: "male", hair: "variant05", skin: 1, hairColor: C.blond, eyes: "variant12", mouth: "happy13", background: "#e3f9d8" },
  { id: "p13", look: "female", hair: "variant35", skin: 0, hairColor: C.auburn, glasses: C.pink, background: "#dbe4ff" },
  { id: "p14", look: "male", hair: "variant07", skin: 4, hairColor: C.grey, beard: "variant01", glasses: C.teal, eyes: "variant16", mouth: "happy02", background: "#f9d9f1" },
  { id: "p15", look: "male", hair: "variant12", skin: 2, hairColor: C.red, eyes: "variant08", mouth: "happy03", background: "#d1f2eb" },
  { id: "p16", look: "male", hair: "variant44", skin: 3, hairColor: C.orange, eyes: "variant06", mouth: "happy04", background: "#ffe8d6" },
  { id: "p17", look: "female", hair: "variant38", skin: 5, hairColor: C.teal, earrings: C.pink, background: "#e0f0ff" },
  { id: "p18", look: "male", hair: "variant09", skin: 1, hairColor: C.dark, beard: "variant02", glasses: C.purple, eyes: "variant17", mouth: "happy13", background: "#fde4ef" },
  { id: "p19", look: "male", hair: "variant03", skin: 4, hairColor: C.blue, eyes: "variant04", mouth: "happy01", background: "#fff4d6" },
  { id: "p20", look: "female", hair: "variant19", skin: 2, hairColor: C.red, earrings: C.blue, background: "#e3e8ff" },
];

export const AVATAR_IDS: readonly string[] = AVATARS.map((avatar) => avatar.id);

const AVATARS_BY_ID = new Map(AVATARS.map((avatar) => [avatar.id, avatar]));

export function isAvatarId(value: unknown): value is string {
  return typeof value === "string" && AVATARS_BY_ID.has(value);
}

/**
 * A stable stand-in for someone whose avatar we don't know (a game saved
 * before avatars, or an id from a newer version of the app): the same seed
 * always gives the same avatar.
 */
export function fallbackAvatarId(seed: string) {
  let hash = 0;
  for (const char of seed.trim().toLowerCase()) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return AVATARS[hash % AVATARS.length].id;
}

/** The avatar for an id, or the stand-in for `seed` when the id is unknown. */
export function avatarSpec(id: string | null | undefined, seed = "") {
  return (id && AVATARS_BY_ID.get(id)) || AVATARS_BY_ID.get(fallbackAvatarId(seed))!;
}

/** Where the avatar's picture is served from. */
export function avatarSrc(id: string | null | undefined, seed = "") {
  return `/avatars/${avatarSpec(id, seed).id}.svg`;
}
