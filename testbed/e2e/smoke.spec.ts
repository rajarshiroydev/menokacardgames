import { expect, type Page, test } from "@playwright/test";

// The browser smoke tests (pre-launch audit M5): a host's main paths on a
// phone, against the testbed. They save or share real games in the testbed,
// so each one cleans up after itself.

type SavedSession = { id: string; name?: string };

// CI keeps no traces (public repository), so a failure says where it ended.
test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status !== testInfo.expectedStatus) {
    console.log(`Ended at ${page.url()}`);
  }
});

async function signInAsBikram(page: Page) {
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

async function dealThreePlayerGame(page: Page, name: string) {
  await page.getByRole("navigation", { name: "Main" }).getByRole("button", { name: "Play" }).click();
  await page.getByRole("button", { name: /Hand by hand/i }).click();
  await page.getByRole("textbox", { name: /Game name/i }).fill(name);
  for (const player of [/^Bikram Big Host/, /^Aditi A\.$/, /^Dev C\.$/]) {
    await page.getByRole("button", { name: player }).click();
  }
  await page.getByRole("button", { name: "Deal First Hand" }).click();
}

test("a host signs in, plays a hand, saves the game and settles up", async ({
  page,
  baseURL,
}) => {
  const name = `Smoke ${Date.now().toString(36)}`;
  const api = { Origin: baseURL ?? "" };

  await test.step("sign in as a test host", () => signInAsBikram(page));

  await test.step("set up a three-player game", () => dealThreePlayerGame(page, name));

  await test.step("two players fold, and the last one wins the blinds", async () => {
    for (let fold = 0; fold < 2; fold += 1) {
      await page.getByRole("button", { name: "Fold", exact: true }).click();
    }
    await expect(page.getByText(/wins/i).first()).toBeVisible();
    await expect(page.getByText("₹150").first()).toBeVisible();
    await page.getByRole("button", { name: "Next", exact: true }).click();
  });

  await test.step("finish and save the game", async () => {
    await page.getByRole("button", { name: /Finish and save session/i }).click();
    await page.getByRole("button", { name: /^Save session$/i }).click();
    await expect(page.getByText(/Settle up/i).first()).toBeVisible();
    await expect(page.getByText(/pays/i).first()).toBeVisible();
    await expect(page.getByText("₹50").first()).toBeVisible();
  });

  await test.step("the game is listed, then deleted again", async () => {
    const listed = await page.request.get("/api/sessions");
    expect(listed.ok()).toBe(true);
    const { sessions } = (await listed.json()) as { sessions: SavedSession[] };
    const saved = sessions.find((session) => session.name === name);
    expect(saved, `saved game "${name}"`).toBeTruthy();

    const discard = await page.request.patch("/api/sessions", {
      headers: api,
      data: { id: saved!.id, action: "discard" },
    });
    expect(discard.status()).toBe(200);
    const remove = await page.request.delete(
      `/api/sessions?id=${encodeURIComponent(saved!.id)}`,
      { headers: api },
    );
    expect(remove.status()).toBe(200);
  });
});

// Found 2026-10-30: a link shared from one phone stayed up after the game was
// restored and discarded on another, because only the sharing phone knew it.
test("a live link ends when its game is discarded on another phone", async ({
  page,
  browser,
  baseURL,
}) => {
  const name = `Live ${Date.now().toString(36)}`;
  let link = "";

  await test.step("the first phone shares a live link", async () => {
    await signInAsBikram(page);
    await dealThreePlayerGame(page, name);
    // Sharing starts from between hands.
    for (let fold = 0; fold < 2; fold += 1) {
      await page.getByRole("button", { name: "Fold", exact: true }).click();
    }
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByRole("button", { name: /Share Live Standings/i }).click();
    const sheet = page.getByRole("dialog").last();
    await sheet.getByRole("button", { name: /Create|Share|Start/i }).first().click();
    await expect(sheet.getByText(/\/live\/[A-Za-z0-9_-]{43}/)).toBeVisible();
    link = (/\/live\/[A-Za-z0-9_-]{43}/.exec(await sheet.innerText()) ?? [""])[0];
    expect((await page.request.get(`/api${link}`)).status()).toBe(200);
  });

  const other = await browser.newPage({ ...test.info().project.use, baseURL });
  try {
    await test.step("a second phone restores the game", async () => {
      await signInAsBikram(other);
      // The first phone backs the game up a few seconds after each change.
      const restore = other.getByRole("button", { name: /Restore game/i });
      await expect(async () => {
        await other.reload({ waitUntil: "networkidle" });
        await expect(restore).toBeVisible({ timeout: 2_000 });
      }).toPass({ timeout: 45_000 });
      await restore.click();
      await expect(other.getByRole("button", { name: /Discard Game/i })).toBeAttached();
    });

    await test.step("it discards the game, and the link ends", async () => {
      const discard = other.getByRole("button", { name: /Discard Game/i });
      // Centred, so the tab bar at the bottom of the screen doesn't cover it.
      await discard.evaluate((button) => button.scrollIntoView({ block: "center" }));
      await discard.click();
      await other.getByRole("dialog").last().getByRole("button", { name: /Reset game/i }).click();
      await expect
        .poll(async () => (await other.request.get(`/api${link}`)).status(), { timeout: 15_000 })
        .toBe(404);
    });
  } finally {
    await other.close();
  }
});
