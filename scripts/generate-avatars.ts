/**
 * Writes public/avatars/<id>.svg for every avatar in lib/avatars.ts.
 * Run `npm run avatars:generate` after changing that list, and commit the
 * files; test/avatars.test.ts fails while they are out of date.
 *
 * DiceBear is a dev dependency only: the app serves the finished files.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

import { createAvatar } from "@dicebear/core";
import * as lorelei from "@dicebear/lorelei";

import { AVATARS, HAIR_COLORS, SKIN_TONES, type AvatarSpec } from "../lib/avatars.ts";

const INK = HAIR_COLORS.dark;
const hex = (color: string) => color.replace(/^#/, "");

export function renderAvatarSvg(avatar: AvatarSpec) {
  const male = avatar.look === "male";
  const lightHair =
    avatar.hairColor === HAIR_COLORS.blond || avatar.hairColor === HAIR_COLORS.grey;
  // The seed only decides the parts not set here (head, nose, eyebrow shape,
  // and a female face's eyes and mouth), so it must stay the id.
  return `${createAvatar(lorelei, {
    seed: avatar.id,
    hair: [avatar.hair as never],
    hairColor: [hex(avatar.hairColor)],
    skinColor: [hex(SKIN_TONES[avatar.skin])],
    eyebrowsColor: [hex(lightHair ? HAIR_COLORS.brown : INK)],
    beard: avatar.beard ? [avatar.beard as never] : undefined,
    beardProbability: avatar.beard ? 100 : 0,
    glassesColor: [hex(avatar.glasses ?? HAIR_COLORS.blue)],
    glassesProbability: avatar.glasses ? 100 : 0,
    earringsColor: [hex(avatar.earrings ?? HAIR_COLORS.pink)],
    earringsProbability: avatar.earrings ? 100 : 0,
    hairAccessoriesColor: [hex(avatar.flowers ?? HAIR_COLORS.pink)],
    hairAccessoriesProbability: avatar.flowers ? 100 : 0,
    frecklesColor: ["b5651d"],
    frecklesProbability: male ? 10 : 30,
    ...(avatar.eyes ? { eyes: [avatar.eyes as never] } : {}),
    ...(avatar.mouth ? { mouth: [avatar.mouth as never] } : {}),
    mouthColor: [male ? "7a3b2e" : "c0505a"],
    noseColor: [hex(INK)],
    backgroundColor: [hex(avatar.background)],
    radius: 50,
  }).toString()}\n`;
}

export const AVATAR_DIR = new URL("../public/avatars/", import.meta.url);

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  mkdirSync(AVATAR_DIR, { recursive: true });
  for (const avatar of AVATARS) {
    writeFileSync(new URL(`${avatar.id}.svg`, AVATAR_DIR), renderAvatarSvg(avatar));
  }
  console.log(`Wrote ${AVATARS.length} avatars to public/avatars/`);
}
