# Feature list

Updated: 24 September 2026

This is a plain-language list of everything Menoka Card Games can do today. It is written for anyone, technical or not. It describes how the app behaves right now; plans and future ideas live in the [feature plan](./FEATURE-PLAN.md).

**Keeping this list current:** whenever a feature is added, changed or removed, update its entry here in the same piece of work, and change the date above. If a rule has a specific number (a time limit, a minimum, a maximum), write the number down, because those are the details that get forgotten.

**A note on money:** the app is a chip ledger. It does not handle real money, payments or cards. Game screens show amounts with a ₹ sign as a label for chips, and the standings show plain chip numbers.

---

## 1. Signing in and your private ledger

- **Sign in with your email, no password.** Enter your email address and the app emails you a one-time sign-in link. Opening the link signs you in. Each link works once and expires after five minutes.
- **Open the link in the same browser.** The sign-in only applies to the browser that opens the link. If you request a link on your phone but open it on your laptop, the laptop is signed in, not the phone. In app previews that keep their own browser, copy the link from the email and paste it into that browser's address bar.
- **Staying signed in.** A sign-in lasts about a week on that device. The top of the screen shows "Signed in as" your email address, with a **Sign out** button.
- **Every host has a private ledger.** The person who signs in is the *host*. Each host has their own friend list, games, history and standings. Two hosts never see each other's data, even if they both have a friend called "Rajarshi". The same friend in two hosts' lists is two separate records with separate histories.
- **Friends don't need accounts.** Friends are just names in the host's list. Only the host signs in.
- **Only the app can change your data.** Requests that add, change or delete data are accepted only when they come from the app's own pages. A request sent from another website, or by a script without the browser's origin information, is refused, even if you are signed in.
- **Locked accounts.** While an account is waiting to be deleted, all of its data is blocked and hidden. Signing in shows the "Deletion is scheduled" screen instead of the ledger (see section 14).

## 2. Home screen

- **Start a new game**, or **Continue game session** if a game is already in progress on this device.
- **All Time Standings**, showing how many saved game sessions there are.
- **Existing Players**, showing how many players are ready to play.
- **Poker Hand Rankings**: a chart of all ten poker hands, strongest to weakest, with an example for each.
- **Read the poker rules**: the house rules explained in the app (see section 17).
- **Delete My Account**: a small link at the bottom (see section 14).
- **Unassigned device data**: appears only if this device has games saved before accounts existed (see section 16).

## 3. Players (your friend list)

- **Add a player** by typing their name. Names can be 1 to 80 characters. Extra spaces are tidied up automatically.
- **No duplicate names.** Names are compared ignoring capital letters, so "Soham" and "soham" are the same player. Adding a name that already exists brings back that same player instead of creating a second one.
- **A player keeps their history when renamed.** Results are linked to the player, not just to the name typed at the time.
- **Discard a player** to hide them from new games. Their past results stay in the history and standings. Discarded players appear in a separate "Discarded Players" list.
- **Restore a player** at any time from the discarded list. Adding a discarded player's name again also restores them.
- **Permanently delete a player** only if all of these are true:
  - they have been discarded first
  - they have never appeared in a saved game (players with saved history can never be permanently deleted, so the records stay complete)
  - you signed in within the last 10 minutes (see section 13)

## 4. Starting a game

- **Game name (optional).** If left empty, the game is called "Game" plus the next number in your ledger, for example "Game 25". Numbers count up separately for each host.
- **Starting stack / first buy-in.** How many chips each player starts with. Must be at least 1.
- **Big blind.** Must be at least 1. The small blind is always half the big blind, rounded down. The screen shows the small blind and the first raise size as you type.
- **Number of players:** 2 to 10.
- **Choose players from your friend list.** Each seat needs a different player. A player already chosen for one seat can't be picked for another. There is a **Manage Players** shortcut if someone is missing.
- **Seating order.** Drag a player by the grip (⠿) to change seats, or use the arrow keys on the grip. Seat 1 deals first, and the dealer moves round the table in seat order.
- **Rising blinds (optional).** See section 5.
- **Start Game** only becomes available when every seat has a different player and the numbers are valid.

## 5. Blinds

- **Fixed blinds** stay the same all game unless you change them.
- **Rising blinds** go up automatically. You choose:
  - how often: every so many **hands** or every so many **minutes** (at least 1)
  - how: **multiply** the big blind (for example ×2, minimum ×1.1) or **add** a fixed amount (at least 1)
  - the setup screen previews the next few big blind levels, for example 100 → 200 → 400 → 800
- **Blinds never change mid-hand.** A new level always starts when the next hand is dealt. For timed blinds, if the time runs out during a hand, the increase waits for the next deal.
- **Blinds are easy to see.** During a hand, the current blinds appear in large numbers in a box right under the pot, labelled with the level when blinds rise. The same box appears between hands. Inside it is the countdown to the next level: hands left for hand-based levels, or minutes and seconds for timed ones (this keeps counting between hands). When the blinds go up, a short message says so.
- **Edit Blind Plan** between hands. You can switch rising blinds on or off or change the schedule. Changes start with the next dealt hand, and the screen shows when the new plan begins.
- **Blind history is saved** with each game (see section 11).

## 6. Playing a hand

- **Positions rotate automatically.** Each hand the dealer button, small blind and big blind move to the next player in seat order who still has chips. With only two players left, the dealer posts the small blind. The screen shows who is dealer, small blind and big blind.
- **Blinds are posted automatically** when a hand is dealt. A player with fewer chips than the blind posts what they have.
- **Stages:** pre-flop, flop, turn and river, shown as a progress bar. Cards are dealt physically; the app only tracks chips.
- **Only the highlighted player can act**, marked "Your turn". Their row shows their stack, how much they need to call, and the minimum bet or raise.
- **Actions:**
  - **Check** when nothing is owed
  - **Call** the current bet
  - **Bet / Raise**: the button shows the amount and bets it in one tap. It starts at the minimum, for example "Bet ₹100".
  - **Bet slider**: above the amount box, a slider snaps to exact amounts: the minimum, 1.5×, 2×, 5× and 10× the minimum (for example ₹100, ₹150, ₹200, ₹500, ₹1,000), then the player's whole stack. The button follows the slider; at the far end it reads "All In ₹9,900" and puts in the whole stack. Steps that would reach the stack are skipped, and a player who can't cover the minimum sees only All In. An exact amount can still be typed in the box.
  - While the slider is off the minimum or an amount is typed, Check/Call and Fold are switched off, so an entered bet can't be lost by pressing the wrong button.
  - **Fold**
  - **All In**: slide the bet slider to the end; the button puts in the player's whole stack, even if it's less than a full call
- **Minimum amounts:**
  - when nobody has bet yet on a street, the minimum bet is the big blind
  - a raise must add at least as much as the last bet or raise on the same street. Before the flop the big blind counts as the first bet, so the first raise goes to at least twice the big blind (blinds ₹50/₹100: raise to ₹200). If someone then raises to ₹400 (₹300 more), the next raise must go to at least ₹700
  - each new street (flop, turn, river) starts again at the big blind
  - a player can always go all in for less
- **Short all-ins.** An all-in that raises by less than the minimum is a "short all-in". Players who already acted must still call it or fold, but they can't raise again: their row shows only Call and Fold, with a note saying why. Players who haven't acted yet on that street can still raise. A later full raise lets everyone raise again. The action log marks it as "short of a full raise".
- **A raise reopens the betting.** The round ends only when every player still in has called, checked, folded or gone all in. The button to deal the next stage stays disabled until then.
- **Everyone else folds:** the last player left wins the pot automatically.
- **All-in run-out:** once betting can't continue (for example, everyone else is all in), the host can deal the remaining stages straight to the showdown without more betting.
- **Action log:** a running list of what happened (bets, calls, folds, wins, buy-ins, blind changes), keeping the latest 80 entries.
- **In-game standings:** every player's current stack, total invested and running profit or loss, sorted by stack.

## 7. Winning the pot

- **Showdown.** After the river, pick the winner from the players still in. A confirmation asks before the pot is given.
- **Split pot.** Choose "Split Between Two Or More", then tap everyone who ties. The screen shows each player's share before you confirm. Splits are equal; any leftover single chips go to the tied players in seat order.
- **Winner celebration.** A card with confetti shows who won, the hand number and the pot size. Press **Next** to continue.

## 8. Between hands

- **Deal The Next Hand** when at least two players have chips.
- **Game over** message when fewer than two players have chips. A busted player can buy in to keep the game going.
- **Buy-ins (rebuys):** a player with no chips can buy back in, between hands only.
  - Every buy-in is the full starting stack. In a 10,000-chip game, each buy-in is 10,000, however high the blinds have gone.
  - A player can buy in as often as needed, up to 63 times in one game (64 buy-ins including the first).
  - Games saved before 24 September 2026 used half the previous buy-in (10,000, then 5,000, then 2,500). Those games, and old backups, stay valid and are ranked as before. A game already in progress when the rule changed keeps its earlier half buy-ins, and any new buy-in is the full stack.
  - Each buy-in asks for confirmation and appears in the log.
  - Every buy-in counts as money invested in the standings.
- **Edit Blind Plan** (see section 5).

## 9. Fixing mistakes

- **Undo (one action):** undoes a player's latest action in the current betting round, and that player acts again.
- **Back To Between Hands:** clears everything from the current hand, returns every chip including the blinds, and puts the dealer, blinds and hand number back to how they were before the hand was dealt.
- **Cancel hand:** refunds every chip from the current hand, including the blinds, and immediately deals a fresh hand with the same hand number. The dealer button moves on to the next player. To keep the same dealer, use Back To Between Hands instead.
- **Undo last hand:** reverses the last completed hand, restoring everyone's stacks and buy-ins from before it.
- **Discard game:** throws away the game in progress without saving. Asks for confirmation first.
- Every one of these asks for confirmation before anything changes.

## 10. The game on this device

- **Games in progress survive a refresh.** The current game is kept on the device, so closing or reloading the page doesn't lose it.
- **Tied to your account.** A game in progress is saved on the device for the signed-in host only. Another host signing in on the same device doesn't see it.
- **One device per game.** A game in progress lives on the device where it was started. It isn't synced to other devices until it's saved.
- **Back button works.** The phone or browser back button moves between the app's screens, and it closes the hand-rankings chart.

## 11. Saving a game and game history

- **Finish And Save Game Session** saves the game to your private history. It needs at least one completed hand. If a hand is still in progress, it's refunded and doesn't count in the saved results. After saving, the app opens the standings.
- **Saving twice is safe.** If a save is retried, for example after a network problem, the game is still saved only once and doesn't use up a second game number.
- **A different game can't hide behind a retry.** A retry only counts as the same save if it describes the same game: the same times, stakes, hands, blinds, players in the same seats, buy-ins and final chips. If a save arrives with the ID of an already saved game but different details, it is refused with "A different session with the same ID is already saved" and nothing is changed.
- **The server double-checks every save.** A game is rejected if the chip totals don't add up, the same player appears twice, or a number is invalid. A bad game can't reach your history.
- **Game history** lists saved games, newest first. The five most recent are shown, with a button to reveal older ones. Each game card shows:
  - name or number, date, number of hands, big blind and number of players
  - each player's result, biggest winner first with a 🏆
  - total buy-ins for any player who bought in more than once
  - blind history, when blinds changed during the game: each plan, the blinds used from each hand, and the blinds it finished at
- **Discard a game** to remove it from the standings and graph. It moves to a "Discarded Sessions" list.
- **Restore a game** to count it again. Standings and graph update straight away.
- **Permanently delete a game** only after it has been discarded, and only within 10 minutes of signing in (see section 13).

## 12. Standings and ranking

- **How players are ranked: average session return.** For each game a player played, the app works out their return as a percentage of what they put in:
  - *put in* = starting stack plus every buy-in
  - *return* = (chips at the end − chips put in) ÷ chips put in
  - their score is the average of those percentages, and every game counts equally
- **Why percentages?** Games are played at very different chip sizes, such as 10,000-chip games and 1,000,000-chip games. Winning 50% is the same score whichever size game it was, so big games don't drown out small ones.
- **Examples:**
  - put in 10,000 and finished with 15,000: +50%
  - put in 1,000,000 and finished with 1,500,000: also +50%
  - put in 10,000 plus a 10,000 buy-in and finished with 24,000: +20%
  - put in 10,000 plus a 10,000 buy-in and finished with nothing: −100%
- **Everyone is ranked from their first game.** There's no minimum number of games, and the number of games is always shown beside the score.
- **Ties share a rank.** Two players with exactly the same score get the same rank.
- **What the score does not measure:** it doesn't adjust for luck, opponents, table size or how long a game lasted. It's a summary of results, not a skill rating.
- **Each player's row shows:**
  - rank, name and average return (to two decimal places) with the number of games behind it
  - **Ranked:** games counted out of games played, for example 24/24
  - **Hands:** total hands dealt in the games they played
  - **Profitable:** games they finished ahead, with the percentage
  - **Invested:** total chips put in
  - **Net chips:** total chips won or lost
- **Games that can't be ranked.** If a game's saved chip totals don't add up, or a player put in no chips, that game is left out of the ranking. The row says which game and why, for example "Not ranked: Game 12 — the saved chip totals do not add up". All the stats on the row count only ranked games, so the numbers always describe the same games. A player with no rankable games shows as "Unranked", never as 0%.
- **Standings graph:**
  - **Return % (default):** each player's running average return after every game. A player's line starts at their first game; missed games keep their previous average rather than counting as zero. Dots mark the games that changed a score. Hovering or tapping a dot shows that game's return, the running average and how many games it's based on.
  - **Raw Chips:** each player's running total of chips won or lost.
  - Up to eight players get distinct colours.
- **Discarded games** don't count anywhere in the standings or graph until restored.
- The five top players are shown first, with a button to reveal the rest.

## 13. Safety for permanent deletion

- **Discard first, delete second.** Nothing can be permanently deleted without being discarded first. Discarding can always be undone.
- **Recent sign-in required.** Permanent deletion only works if you signed in within the last **10 minutes**. This protects against someone using a phone or laptop that was left signed in.
- **If your sign-in is older,** the app explains why and offers to email you a new sign-in link. Open it on the same device, then delete again.
- **Only your own data.** A host can never delete, or even see, another host's players or games.
- **The 10-minute window may change** once we see how it works in practice.

## 14. Deleting your account

- **Delete My Account** is a small link at the bottom of the home screen. A confirmation explains exactly what happens before anything changes.
- **Recent sign-in required.** Like permanent deletion, it only works within **10 minutes** of signing in. Otherwise the app offers to email a fresh sign-in link.
- **What happens straight away:**
  - your players, games and standings are locked and hidden
  - you are signed out on **every** device, not just this one
  - the game in progress on this device is cleared
  - the sign-in page confirms the account is locked
- **30 days to change your mind.** Sign in again with the same email within **30 days** to see the "Deletion is scheduled" screen. It shows when you asked and the exact date and time everything will be deleted. Press **Recover my account** and everything comes back exactly as it was.
- **After 30 days** the account can no longer be recovered. An automatic check runs once a day (around 08:30 India time) and permanently deletes every account whose 30 days are up:
  - first the sign-in identity, so the email can no longer sign in to it
  - then the account and everything in it: players, games, results, buy-ins and records
  - if anything goes wrong, nothing is half-deleted: the account stays locked and the check tries again the next day
- **Deletion can be up to a day late** because the check runs daily. An account is never deleted early.
- **After deletion,** signing in with the same email starts a brand-new, empty account.
- **Backups:** our database provider (Neon) keeps short-term recovery copies of deleted data for up to **6 hours**, after which it is gone for good.
- **A record is kept** of each deletion request and each recovery, visible only to that account.
- **Using another email** signs you in to a different, separate account; it does not recover the locked one.

## 15. Backup: export and import

- **Export Backup** downloads a file of all your saved games (not discarded ones), dated with today's date.
- **Import** reads a backup file and adds only games that aren't already in your ledger, including discarded ones. It never overwrites or duplicates existing games. Importing your own export again changes nothing and just says "Already up to date".
- **Review before saving.** Before anything is saved, a review screen shows how many new games will be added and what was skipped (already in your ledger, repeated in the file, or unreadable). It lists every player in those games and how each one will be saved:
  - **Your player**: matched to someone on your list. Games from your own backup match by player record, even if the name has changed since. Names alone match ignoring capital letters.
  - **Your discarded player**: matched to a discarded player, who stays discarded.
  - **New player**: not on your list, and added to it when you confirm.
  - **Player record from another ledger**: for example, a backup from another host's account. The import can't go ahead, and nothing is added.
- **Add** saves the games; **Cancel** saves nothing. Every game goes through the same server checks as a normal save. If the server refuses one (for example, chips that don't add up), the review screen shows the reason and nothing is added.
- Imported games belong to the signed-in host.
- A single import can send at most **2 MB** of new games (a ledger of a few dozen games is well under 100 KB). Larger files are refused and nothing is added.

## 16. Data from before accounts

- **Games saved on a device before accounts existed** stay separate and are never added to anyone's ledger automatically.
- **Unfinished game:** the host can review it and adopt it into their account, as long as they don't already have a game in progress on that device.
- **Saved games:** the host sees a list with each game's date, big blind and players, ticks the ones that belong to them, and adds only those. Unticked games stay unassigned on the device.

## 17. Reference and help

- **Poker hand rankings chart**, from the home screen.
- **Poker rules**, from the home screen. They explain this table's house rules: setup, positions, turn order, minimum raises, buy-ins, splits and how to fix mistakes.

## 18. Devices and installation

- Designed for phones first, with layouts for tablets and desktops.
- Can be added to a phone's home screen and opened like an app, full screen and without the browser bar.
- Respects the "reduce motion" setting for animations such as the seat-dragging effect.

---

## Known gaps

These are known limitations, not planned features. Planned work is in the [feature plan](./FEATURE-PLAN.md).

- A game in progress can't be moved to another device before it's saved.
- Import handles up to 250 new games per file.
