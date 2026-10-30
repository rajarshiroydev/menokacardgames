import { expect, type Page, test } from "@playwright/test";

import {
  backupsNamed,
  dealThreePlayerGame,
  deleteBackupsNamed,
  PLAYERS,
  signInAsBikram,
} from "./helpers";

// The live game, end to end (plan "splitting the big component: plan for
// PokerLedger", step 0): the regression suite for refactoring PokerLedger.
// Each test discards its game; a test that stops part way has its backup
// deleted after it.

let gameName = "";

test.afterEach(async ({ page, baseURL }, testInfo) => {
  if (testInfo.status !== testInfo.expectedStatus) {
    console.log(`Ended at ${page.url()}`);
    if (gameName) await deleteBackupsNamed(page, baseURL ?? "", gameName);
  }
});

const button = (page: Page, name: string | RegExp) =>
  page.getByRole("button", { name, exact: typeof name === "string" });

/** Checks or calls round the table, dealing each street, up to the showdown. */
async function playToShowdown(page: Page) {
  const showdown = page.getByRole("heading", { name: "Showdown", level: 1 });
  const deal = page.getByRole("button", { name: /^Deal (FLOP|TURN|RIVER)$/ });
  for (let turn = 0; turn < 30 && (await showdown.count()) === 0; turn += 1) {
    if ((await deal.count()) && (await deal.isEnabled())) await deal.click();
    else await page.getByRole("button", { name: /^(Check|Call ₹)/ }).first().click();
  }
  await expect(showdown).toBeVisible();
}

async function closeWinnerCard(page: Page, winners: RegExp) {
  const card = page.getByRole("dialog", { name: winners });
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: "Next" }).click();
  await expect(page.getByRole("heading", { name: "Between Hands", level: 1 })).toBeVisible();
}

/** Scrolled to the middle first, so the tab bar doesn't cover it. */
async function clickCentred(page: Page, name: string | RegExp) {
  const target = button(page, name);
  await target.evaluate((element) => element.scrollIntoView({ block: "center" }));
  await target.click();
}

test("a hand-by-hand game: side pots, rebuys, table sheets, a split pot and undo", async ({
  page,
}) => {
  test.setTimeout(240_000);
  gameName = `Live game ${Date.now().toString(36)}`;

  await test.step("deal with Aditi on a short stack and Bikram dealing", async () => {
    await signInAsBikram(page);
    await dealThreePlayerGame(page, gameName, {
      buyIns: { "Aditi A.": "2000" },
      fixedDealer: true,
    });
    await expect(page.getByRole("heading", { name: "Hand 1", level: 1 })).toBeVisible();
  });

  await test.step("the game is backed up to the server", async () => {
    await expect
      .poll(async () => (await backupsNamed(page, gameName)).length, { timeout: 15_000 })
      .toBe(1);
  });

  await test.step("an action is undone, and the help and Table view open", async () => {
    await button(page, "Call ₹100").click();
    await expect(page.getByText("₹250", { exact: true }).first()).toBeVisible();
    await button(page, "Undo Bikram's Call").click();
    await expect(button(page, "Call ₹100")).toBeVisible();
    await expect(page.getByText("₹150", { exact: true }).first()).toBeVisible();
    await button(page, "About the raise amount").click();
    await page.getByRole("dialog").getByRole("button", { name: /Got it/i }).click();
    await page.getByRole("radio", { name: "Table" }).click();
    await expect(button(page, "Move every seat one place clockwise")).toBeVisible();
    await page.getByRole("radio", { name: "List" }).click();
  });

  await test.step("everyone is all in: a main pot and a side pot", async () => {
    await button(page, "All in").click();
    await button(page, "All in").nth(1).click();
    await button(page, "Call ₹1,950").click();
    await button(page, "Call ₹9,900").click();
    await expect(page.getByText("₹22,000", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Main ₹6,000 · Side ₹16,000").first()).toBeVisible();
    for (const street of ["FLOP", "TURN", "RIVER"]) {
      await button(page, `Deal ${street}`).click();
    }
    await expect(page.getByRole("heading", { name: "Showdown", level: 1 })).toBeVisible();
  });

  await test.step("Aditi wins the main pot and Dev the side pot", async () => {
    await button(page, "Aditi A. Tap to pick").click();
    await button(page, "Dev C. Tap to pick").last().click();
    await button(page, "Award ₹22,000").click();
    await page.getByRole("dialog", { name: "Confirm action" }).getByRole("button", { name: "Award pots" }).click();
    await closeWinnerCard(page, /Aditi A\. and Dev C\. win/i);
    for (const result of ["+₹6,000", "+₹4,000", "−₹10,000"]) {
      await expect(page.getByText(result, { exact: true })).toBeVisible();
    }
  });

  await test.step("Bikram buys in again for his own amount", async () => {
    await button(page, "Bikram Big Host Buy in").click();
    const sheet = page.getByRole("dialog", { name: /Buy In Bikram/i });
    await sheet.getByRole("textbox", { name: "Buy-in amount" }).fill("5000");
    await sheet.getByRole("button", { name: "Buy In · ₹5,000" }).click();
    await expect(page.getByText("Start ₹10,000 · Buy-ins ₹5,000")).toBeVisible();
  });

  await test.step("Meera joins, and Aditi cashes out", async () => {
    await button(page, "Add player").click();
    const add = page.getByRole("dialog", { name: "Add Player" });
    await add.getByRole("button", { name: "Meera", exact: true }).click();
    await add.getByRole("textbox", { name: "Buy-in amount" }).fill("3000");
    await add.getByRole("button", { name: "Add Meera · ₹3,000" }).click();
    await expect(page.getByText("Start ₹3,000", { exact: true })).toBeVisible();

    await button(page, "Cash out").click();
    await page.getByRole("dialog", { name: "Cash Out" }).getByRole("button", { name: /^Aditi A\. ₹6,000/ }).click();
    await page.getByRole("dialog").last().getByRole("button", { name: "Cash Out · ₹6,000" }).click();
    await expect(page.getByText(/Cashed out · Start ₹2,000/i)).toBeVisible();
  });

  await test.step("rebuy rules and the blind plan are saved", async () => {
    await button(page, "Edit rebuys").click();
    let rebuys = page.getByRole("dialog", { name: "Edit Rebuys" });
    await rebuys.getByRole("radio", { name: "2" }).click();
    await rebuys.getByRole("button", { name: "Save Rebuys" }).click();
    await button(page, "Edit rebuys").click();
    rebuys = page.getByRole("dialog", { name: "Edit Rebuys" });
    await expect(rebuys.getByRole("radio", { name: "2" })).toBeChecked();
    await rebuys.getByRole("button", { name: "Cancel" }).click();

    await button(page, "Edit blind plan").click();
    const blinds = page.getByRole("dialog", { name: "Edit Blind Plan" });
    await blinds.getByRole("checkbox", { name: "Blinds Go Up" }).click();
    await blinds.getByRole("button", { name: "Save Blind Plan" }).click();
    await button(page, "Deal The Next Hand").click();
    await expect(page.getByRole("heading", { name: "Hand 2", level: 1 })).toBeVisible();
    await expect(page.getByText(/₹100\/₹200 in 9 hands/).first()).toBeVisible();
  });

  await test.step("hand 2 is split two ways", async () => {
    await playToShowdown(page);
    await button(page, "Split this pot").click();
    const include = page.getByRole("button", { name: / Tap to include$/ });
    await include.first().click();
    await include.first().click();
    await button(page, "Split ₹300 2 ways").click();
    await closeWinnerCard(page, /win/i);
  });

  await test.step("hand 3 has one winner, then is undone", async () => {
    await button(page, "Deal The Next Hand").click();
    await expect(page.getByRole("heading", { name: "Hand 3", level: 1 })).toBeVisible();
    await playToShowdown(page);
    await page.getByRole("button", { name: / Tap to pick$/ }).first().click();
    await button(page, /^.+ wins ₹300$/).click();
    await closeWinnerCard(page, /wins/i);
    await clickCentred(page, "Undo hand 3");
    await page.getByRole("dialog").last().getByRole("button", { name: "Undo hand" }).click();
    await expect(page.getByRole("heading", { name: "Hand 3", level: 1 })).toBeVisible();
    await expect(button(page, "Cancel hand 3")).toBeVisible();
  });

  await test.step("the game is discarded, and its backup goes", async () => {
    await clickCentred(page, /Discard game/i);
    await page.getByRole("dialog").last().getByRole("button", { name: "Reset game" }).click();
    await expect(page.getByRole("heading", { name: "Bikram Big Host", level: 1 })).toBeVisible();
    await expect
      .poll(async () => (await backupsNamed(page, gameName)).length, { timeout: 15_000 })
      .toBe(0);
  });
});

test("a quick ledger: buy-ins, a late player, a cash-out, then discarded", async ({
  page,
}) => {
  gameName = `Ledger ${Date.now().toString(36)}`;

  await test.step("Home's Hand rankings page", async () => {
    await signInAsBikram(page);
    await page.getByRole("button", { name: /^Hand rankings/ }).click();
    await expect(page.getByText("Royal Flush", { exact: true })).toBeVisible();
    await expect(page.getByText("High Card", { exact: true })).toBeVisible();
    await page.goBack();
  });

  await test.step("start a quick ledger", async () => {
    await page.getByRole("navigation", { name: "Main" }).getByRole("button", { name: "Play" }).click();
    await page.getByRole("button", { name: /Quick ledger/i }).click();
    await page.getByRole("textbox", { name: /Game name/i }).fill(gameName);
    for (const player of PLAYERS) {
      await page.getByRole("button", { name: player }).click();
    }
    await button(page, "Start Quick Ledger").click();
    await expect(page.getByRole("heading", { name: "Quick Ledger", level: 1 })).toBeVisible();
  });

  await test.step("Aditi buys in again and Meera joins", async () => {
    await button(page, "Buy in Aditi A. again").click();
    await page.getByRole("dialog", { name: /Buy In Aditi/i }).getByRole("button", { name: "Buy In · ₹10,000" }).click();
    await expect(page.getByText(/2 buy-ins · ₹20,000/i)).toBeVisible();
    await button(page, "Add player").click();
    const add = page.getByRole("dialog", { name: "Add Player" });
    await add.getByRole("button", { name: "Meera", exact: true }).click();
    await add.getByRole("button", { name: "Add Meera · ₹10,000" }).click();
    await expect(page.getByText("4 at the table")).toBeVisible();
  });

  await test.step("Dev cashes out with ₹12,000", async () => {
    await button(page, "Cash out").click();
    const sheet = page.getByRole("dialog", { name: "Cash Out" });
    await sheet.getByRole("button", { name: /^Dev C\./ }).click();
    await sheet.getByRole("textbox", { name: "Dev C.'s chips" }).fill("12000");
    await sheet.getByRole("button", { name: /^Cash out/i }).last().click();
    await page.getByRole("dialog", { name: "Confirm action" }).getByRole("button", { name: "Cash Out · ₹12,000" }).click();
    await expect(page.locator("main")).toContainText(/₹12,000\s*Cashed out/i);
  });

  await test.step("the ledger is discarded", async () => {
    await clickCentred(page, /Discard game/i);
    await page.getByRole("dialog", { name: "Confirm action" }).getByRole("button", { name: "Discard game" }).click();
    await expect(page.getByRole("heading", { name: "Bikram Big Host", level: 1 })).toBeVisible();
  });
});
