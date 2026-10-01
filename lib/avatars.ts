/**
 * The avatars players choose from. They are drawn in code (see
 * components/avatar-art.tsx), so no image service or licence is involved.
 *
 * Each avatar's id is stored in `accounts.avatar` and `players.avatar`
 * (migration 0015), so an id must never be reused for a different drawing.
 * New avatars get new ids; the database picks defaults only from the ids that
 * existed when the migration ran (`public.random_avatar()`).
 */

export type HairBack = "long" | "bob" | "pony" | "bun";
export type HairFront = "short" | "fringe" | "spiky" | "buzz" | "side" | "curly";

export type AvatarSpec = {
  id: string;
  /** Index into SKIN_TONES. */
  skin: number;
  hair: string;
  back?: HairBack;
  front?: HairFront;
  /** A headscarf in this colour, framing the face; hides hair and ears. */
  hijab?: string;
  /** A turban in this colour. */
  turban?: string;
  beard?: boolean;
  glasses?: boolean;
  cap?: string;
  band?: string;
  background: string;
  shirt: string;
  smile: "open" | "closed";
};

export const SKIN_TONES = [
  "#f6d7c3",
  "#eec1a0",
  "#d9a27b",
  "#b97c57",
  "#8d5a3b",
  "#5e3b28",
] as const;

const DARK = "#1d1411";
const BROWN_BLACK = "#2b1d16";

export const AVATARS: readonly AvatarSpec[] = [
  { id: "p01", skin: 1, hair: BROWN_BLACK, front: "side", background: "#cfe8ff", shirt: "#3a7bd5", smile: "open" },
  { id: "p02", skin: 3, hair: BROWN_BLACK, back: "long", front: "fringe", background: "#ffd9e2", shirt: "#e85d75", smile: "open" },
  { id: "p03", skin: 0, hair: "#e0b25c", front: "curly", background: "#fff1c2", shirt: "#f2994a", smile: "closed" },
  { id: "p04", skin: 4, hair: DARK, front: "buzz", beard: true, background: "#d6f5e3", shirt: "#27ae60", smile: "open" },
  { id: "p05", skin: 2, hair: "#5a3825", back: "bob", front: "fringe", glasses: true, background: "#e8dcff", shirt: "#8e6cdf", smile: "closed" },
  { id: "p06", skin: 5, hair: DARK, front: "curly", background: "#ffe0c7", shirt: "#d35400", smile: "open" },
  { id: "p07", skin: 1, hair: "#c2412d", back: "pony", front: "fringe", background: "#d9f2f7", shirt: "#16a085", smile: "open" },
  { id: "p08", skin: 3, hair: BROWN_BLACK, front: "spiky", background: "#fde2b8", shirt: "#34495e", smile: "open" },
  { id: "p09", skin: 0, hair: "#8c8c8c", front: "side", glasses: true, beard: true, background: "#e4ecf2", shirt: "#5d6d7e", smile: "closed" },
  { id: "p10", skin: 2, hair: BROWN_BLACK, back: "bun", front: "fringe", background: "#ffd6cc", shirt: "#c0392b", smile: "open" },
  { id: "p11", skin: 4, hair: BROWN_BLACK, front: "short", cap: "#e74c3c", background: "#fff3b0", shirt: "#2c3e50", smile: "open" },
  { id: "p12", skin: 1, hair: "#5a3825", back: "long", front: "fringe", band: "#f368e0", background: "#e3f9d8", shirt: "#6ab04c", smile: "closed" },
  { id: "p13", skin: 3, hair: DARK, front: "short", glasses: true, background: "#dbe4ff", shirt: "#4834d4", smile: "open" },
  { id: "p14", skin: 5, hair: DARK, back: "bob", front: "curly", background: "#f9d9f1", shirt: "#be2edd", smile: "open" },
  { id: "p15", skin: 2, hair: "#a0603a", front: "spiky", beard: true, background: "#d1f2eb", shirt: "#0e7c6b", smile: "closed" },
  { id: "p16", skin: 0, hair: "#e0b25c", back: "pony", front: "side", background: "#ffe8d6", shirt: "#e17055", smile: "open" },
  { id: "p17", skin: 2, hair: DARK, hijab: "#2e86de", background: "#e0f0ff", shirt: "#2e86de", smile: "open" },
  { id: "p18", skin: 4, hair: DARK, hijab: "#b33771", background: "#fde4ef", shirt: "#6d214f", smile: "closed" },
  { id: "p19", skin: 2, hair: DARK, turban: "#f39c12", beard: true, background: "#fff4d6", shirt: "#1e3799", smile: "open" },
  { id: "p20", skin: 3, hair: DARK, turban: "#1e3799", background: "#e3e8ff", shirt: "#e58e26", smile: "open" },
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

/** The drawing for an id, or the stand-in for `seed` when the id is unknown. */
export function avatarSpec(id: string | null | undefined, seed = "") {
  return (id && AVATARS_BY_ID.get(id)) || AVATARS_BY_ID.get(fallbackAvatarId(seed))!;
}
