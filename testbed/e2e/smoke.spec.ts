import { expect, test } from "@playwright/test";

// The browser smoke test (pre-launch audit M5): a host's main path on a
// phone, against the testbed. It saves a real game in the testbed, so it
// deletes that game again at the end.

type SavedSession = { id: string; name?: string };

// CI keeps no traces (public repository), so a failure says where it ended.
test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status !== testInfo.expectedStatus) {
    console.log(`Ended at ${page.url()}`);
  }
});

test("a host signs in, plays a hand, saves the game and settles up", async ({
  page,
  baseURL,
}) => {
  const name = `Smoke ${Date.now().toString(36)}`;
  const api = { Origin: baseURL ?? "" };

  await test.step("sign in as a test host", async () => {
    await page.goto("/auth/sign-in", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: /^Bikram Big Host/ }).click();
    const home = page.getByRole("heading", { name: "Bikram Big Host", level: 1 });
    const refused = page.getByRole("alert").filter({ hasText: /Sign-in failed/ });
    await expect(home.or(refused)).toBeVisible();
    // A refused sign-in comes back with Neon Auth's reason (?testbed=…).
    expect(await refused.count(), `sign-in refused: ${page.url()}`).toBe(0);
  });

  await test.step("set up a three-player game", async () => {
    await page.getByRole("navigation", { name: "Main" }).getByRole("button", { name: "Play" }).click();
    await page.getByRole("button", { name: /Hand by hand/i }).click();
    await page.getByRole("textbox", { name: /Game name/i }).fill(name);
    for (const player of [/^Bikram Big Host/, /^Aditi A\.$/, /^Dev C\.$/]) {
      await page.getByRole("button", { name: player }).click();
    }
    await page.getByRole("button", { name: "Deal First Hand" }).click();
  });

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
