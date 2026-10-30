import { expect, type Page } from "@playwright/test";

// Shared steps for the browser specs. They sign in as the testbed's big
// host, Bikram, whose seeded players include Aditi A., Dev C. and Meera.

export const PLAYERS = [/^Bikram Big Host/, /^Aditi A\.$/, /^Dev C\.$/];

export async function signInAsBikram(page: Page) {
  const home = page.getByRole("heading", { name: "Bikram Big Host", level: 1 });
  const refused = page.getByRole("alert").filter({ hasText: /Sign-in failed/ });
  for (let attempt = 1; ; attempt += 1) {
    await page.goto("/auth/sign-in", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: /^Bikram Big Host/ }).click();
    await expect(home.or(refused)).toBeVisible();
    if ((await refused.count()) === 0) return;
    // A refused sign-in comes back with Neon Auth's reason (?testbed=…).
    // Its limit on sign-ins from one address (the route checks run just
    // before in CI) passes after a short wait; anything else fails here.
    const limited = page.url().includes("over_request_rate_limit");
    expect(limited && attempt < 5, `sign-in refused: ${page.url()}`).toBe(true);
    await page.waitForTimeout(5_000 * attempt);
  }
}

export async function dealThreePlayerGame(
  page: Page,
  name: string,
  options: {
    /** Own amounts, by the name on the setup's buy-in box. */
    buyIns?: Record<string, string>;
    /** Seat 1 (Bikram) deals first instead of a random seat. */
    fixedDealer?: boolean;
  } = {},
) {
  await page.getByRole("navigation", { name: "Main" }).getByRole("button", { name: "Play" }).click();
  await page.getByRole("button", { name: /Hand by hand/i }).click();
  await page.getByRole("textbox", { name: /Game name/i }).fill(name);
  for (const player of PLAYERS) {
    await page.getByRole("button", { name: player }).click();
  }
  if (options.fixedDealer) {
    await page.getByRole("switch", { name: "Randomize dealer" }).click();
  }
  if (options.buyIns) {
    await page.getByRole("switch", { name: "Own amounts" }).click();
    for (const [player, amount] of Object.entries(options.buyIns)) {
      await page.getByRole("textbox", { name: `${player}'s buy-in` }).fill(amount);
    }
  }
  await page.getByRole("button", { name: "Deal First Hand" }).click();
}

type BackupSummary = { gameId: string; name: string };

/** The account's unfinished-game backups with this name, from the server. */
export async function backupsNamed(page: Page, name: string) {
  const response = await page.request.get("/api/game-backups");
  expect(response.ok()).toBe(true);
  const { backups } = (await response.json()) as { backups: BackupSummary[] };
  return backups.filter((backup) => backup.name === name);
}

/** Removes a test game's backups, for a test that stopped part way. */
export async function deleteBackupsNamed(page: Page, baseURL: string, name: string) {
  for (const backup of await backupsNamed(page, name)) {
    await page.request.delete(
      `/api/game-backups?gameId=${encodeURIComponent(backup.gameId)}`,
      { headers: { Origin: baseURL } },
    );
  }
}
