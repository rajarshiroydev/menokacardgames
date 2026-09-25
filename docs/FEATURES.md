# Feature list

Updated: 25 September 2026

This is a plain-language list of everything Menoka Card Games can do today. It is written for anyone, technical or not. It describes how the app behaves right now; plans and future ideas live in the [feature plan](./FEATURE-PLAN.md).

**Keeping this list current:** whenever a feature is added, changed or removed, update its entry here in the same piece of work, and change the date above. If a rule has a specific number (a time limit, a minimum, a maximum), write the number down, because those are the details that get forgotten.

**A note on money:** the app is a chip ledger. It does not handle real money, payments or cards. Game screens show amounts with a ₹ sign as a label for chips, and the standings show plain chip numbers.

---

## 1. Signing in and your private ledger

- **Sign in with your email, no password.** Enter your email address and the app emails you a one-time sign-in link. Opening the link signs you in. Each link works once and expires after five minutes.
- **Open the link in the same browser.** The sign-in only applies to the browser that opens the link. If you request a link on your phone but open it on your laptop, the laptop is signed in, not the phone. In app previews that keep their own browser, copy the link from the email and paste it into that browser's address bar.
- **Staying signed in.** A sign-in lasts about a week on that device. The bottom of the home screen shows "Signed in as" your email address, with a **Sign out** button.
- **Every host has a private ledger.** The person who signs in is the *host*. Each host has their own friend list, games, history and standings. Two hosts never see each other's data, even if they both have a friend called "Rajarshi". The same friend in two hosts' lists is two separate records with separate histories.
- **Friends don't need accounts.** Friends are just names in the host's list. Only the host signs in.
- **Only the app can change your data.** Requests that add, change or delete data are accepted only when they come from the app's own pages. A request sent from another website, or by a script without the browser's origin information, is refused, even if you are signed in.
- **Locked accounts.** While an account is waiting to be deleted, all of its data is blocked and hidden. Signing in shows the "Deletion is scheduled" screen instead of the ledger (see section 14).

## 2. Home screen and getting around

- **Start A Game**, a green card that opens table setup. While a game is in progress it becomes a **Continue Game Session** card instead, marked "Live", with the hand number, the stage and the pot.
- **Four tiles:** **All Time Standings** (how many saved game sessions there are), **Existing Players** (how many players are ready to play), **Hand Rankings** (all ten poker hands, see section 17) and **New Game**. While a game is in progress, New Game returns to it, because only one game runs at a time.
- **Read the poker rules**: the house rules explained in the app (see section 17).
- **Delete my account**: a small link at the bottom (see section 14).
- **Unassigned device data**: appears only if this device has games saved before accounts existed (see section 16).
- **Tab bar.** A bar at the bottom of every screen has five tabs: **Home**, **Play** (the game in progress, or table setup when there isn't one), **Ranks** (standings), **Games** (saved game sessions) and **Players**. The current tab is highlighted in green.
- **Every other screen** has a back button (←) at the top left and a theme button at the top right.
- **Dark and light themes.** The theme button (a small green-blue dot, labelled "Dark" or "Light" on the home screen) switches the whole app between a dark and a light look. The choice is remembered on that device. Dark is the default.

## 3. Players (your friend list)

- **Add a player** by typing their name. Names can be 1 to 80 characters. Extra spaces are tidied up automatically.
- **No duplicate names.** Names are compared ignoring capital letters, so "Soham" and "soham" are the same player. Typing the name of an active player shows "Soham is already in the directory." under the box and adds nothing. Adding a discarded player's name brings back that same player instead of creating a second one. Pressing **Add** with an empty box shows "Enter a name first."
- **A player keeps their history when renamed.** Results are linked to the player, not just to the name typed at the time.
- **Discard a player** to hide them from new games. Their past results stay in the history and standings. Discarded players move to the bottom of the list, faded and marked "· discarded".
- **Restore a player** at any time from the list. Adding a discarded player's name again also restores them.
- **Permanently delete a player** with the **Delete** button beside a discarded player. The button only appears when all of these are true:
  - they have been discarded first
  - they have never appeared in a saved game (players with saved history can never be permanently deleted, so the records stay complete)
  - you signed in within the last 10 minutes (see section 13)

## 4. Starting a game

- **Game name (optional).** If left empty, the game is called "Game" plus the next number in your ledger, for example "Game 25". Numbers count up separately for each host.
- **Seat players.** Every player on your friend list appears as a button. Tap players to seat them; the order you tap is the seating order, and each seated player shows their seat number. Tap a seated player again to take them off the table. The screen says how many are seated and asks for at least 2. Up to 10 players can be seated; once 10 are seated, the others can't be tapped. There is a **Manage players** shortcut if someone is missing.
- **Seating order.** Once two or more are seated, a list shows the seats in order. Drag a player by the grip (⠿) to change seats, or use the arrow keys on the grip. Seat 1 deals first, and the dealer moves round the table in seat order.
- **Starting stack / first buy-in.** Quick choices of 5K, 10K (the default), 20K and 50K chips, or **Other** to type any amount of at least 1.
- **Big blind.** Quick choices of ₹50, ₹100 (the default), ₹200, ₹500 and ₹1K, or **Other** to type any amount of at least 1. The small blind is always half the big blind, rounded down. The screen shows the small blind and the first raise size.
- **Blind levels.** **Fixed**, **By hands** or **By minutes**. See section 5.
- **Deal First Hand** only becomes available when at least two different players are seated and the numbers are valid. It starts the game and deals hand 1.

## 5. Blinds

- **Fixed blinds** stay the same all game unless you change them.
- **Rising blinds** go up automatically. You choose:
  - how often: every so many **hands** or every so many **minutes** (at least 1). Choosing By hands starts at every 10 hands; By minutes starts at every 20 minutes
  - how: **multiply** the big blind (for example ×2, minimum ×1.1) or **add** a fixed amount (at least 1)
  - the setup screen previews the next few big blind levels, for example 100 → 200 → 400 → 800
- **Blinds never change mid-hand.** A new level always starts when the next hand is dealt. For timed blinds, if the time runs out during a hand, the increase waits for the next deal.
- **Blinds are easy to see.** During a hand, the current blinds appear in large numbers in a pill right under the pot, with a level badge (for example "L2") when blinds rise. The same pill appears between hands. Inside it is the countdown to the next level: hands left for hand-based levels, or minutes and seconds for timed ones (this keeps counting between hands). When the blinds go up, a short message says so.
- **Edit Blind Plan** between hands. You can switch rising blinds on or off or change the schedule. Changes start with the next dealt hand, and the screen shows when the new plan begins.
- **Blind history is saved** with each game (see section 11).

## 6. Playing a hand

- **Positions rotate automatically.** Each hand the dealer button, small blind and big blind move to the next player in seat order who still has chips. With only two players left, the dealer posts the small blind. A badge on each player's initial shows **D** (dealer), **SB** or **BB** (both, "D SB", for the heads-up dealer).
- **Seat cards.** Each player has a card with their initial in their own colour, their stack and how much they have put in this street, and a status such as Waiting, Small blind ₹50, Big blind ₹100, Checked, Called ₹200, Bet ₹100, Raised to ₹700, All in ₹2,000 or Folded. Folded players are faded and listed last.
- **Blinds are posted automatically** when a hand is dealt. A player with fewer chips than the blind posts what they have.
- **Stages:** pre-flop, flop, turn and river, shown as a progress bar. Cards are dealt physically; the app only tracks chips.
- **Only the highlighted player can act**, marked "Your turn" with a green outline. Their card shows how much they need to call and the minimum bet or raise. Raises are shown as the total the bet reaches, the way players say it at the table: for example "Min raise ₹1,300" for a player who already has ₹1,100 in. A player who can't cover the minimum sees "All in" and their stack instead.
- **Actions:**
  - the three buttons, left to right, are **Fold**, **Check** or **Call ₹X**, and **Bet / Raise**
  - **Check** when nothing is owed
  - **Call ₹X** the current bet; the button shows what calling costs
  - **Bet / Raise**: the button shows the amount and bets it in one tap. It starts at the minimum, for example "Bet ₹100". A raise shows the total it reaches, for example "Raise ₹1,300". Once a bet stands (before the flop the big blind counts), putting in more is always called a raise, so the big blind's own raise also reads "Raise".
  - **Amount box**: the large green number on the right of the card. It shows the minimum until you type an exact amount. The box, slider and quick buttons are always the chips to put in now, not the total.
  - **Bet slider**: a slider snaps to exact amounts: the minimum, 1.5×, 2×, 5× and 10× the minimum (for example ₹100, ₹150, ₹200, ₹500, ₹1,000), then the player's whole stack. The button follows the slider; at the far end it reads "All in" and puts in the whole stack. Steps that would reach the stack are skipped, and a player who can't cover the minimum sees only All in.
  - **Quick buttons** under the slider: **Min** (back to the minimum), **½ Pot** and **Pot** (half or all of the pot, never below the minimum or above the stack) and **All in**.
  - While an amount other than the minimum is chosen, Check/Call and Fold are switched off, so an entered bet can't be lost by pressing the wrong button. "Clear amount to call or fold" (or **Min**) switches them back on.
  - **Fold**
  - **All in**: the quick button or the end of the slider; the button puts in the player's whole stack, even if it's less than a full call
- **Minimum amounts:**
  - when nobody has bet yet on a street, the minimum bet is the big blind
  - a raise must add at least as much as the last bet or raise on the same street. Before the flop the big blind counts as the first bet, so the first raise goes to at least twice the big blind (blinds ₹50/₹100: raise to ₹200). If someone then raises to ₹400 (₹300 more), the next raise must go to at least ₹700
  - each new street (flop, turn, river) starts again at the big blind
  - a player can always go all in for less
- **Short all-ins.** An all-in that raises by less than the minimum is a "short all-in". Players who already acted must still call it or fold, but they can't raise again: their row shows only Call and Fold, with a note saying why. Players who haven't acted yet on that street can still raise. A later full raise lets everyone raise again. The action log marks it as "short of a full raise".
- **A raise reopens the betting.** The round ends only when every player still in has called, checked, folded or gone all in. The blue button that deals the next street always names it ("Deal FLOP →", "Deal TURN →" or "Deal RIVER →"); it is faded and can't be pressed until the round ends. It sits under the seat cards and stays in the same spot while you play: when a player's action ends the round, their card stays open (greyed out, marked "Betting round complete · Deal FLOP next", with Undo still available) until the next street is dealt, so the Deal button doesn't jump. At the river it is replaced by the Pick the winner card.
- **Pot and stages.** A scoreboard at the top shows the four stages as a bar (finished stages green, the current one green-blue), the pot in very large numbers and the blinds. Very large pots shrink to fit on one line.
- **Everyone else folds:** the last player left wins the pot automatically.
- **All-in run-out:** once betting can't continue (for example, everyone else is all in), the host can deal the remaining stages straight to the showdown without more betting.
- **Action log:** a running list of what happened (bets, calls, folds, wins, buy-ins, blind changes), newest first, keeping the latest 80 entries. The 6 newest are shown; "Show all" opens the rest.
- **In-game standings:** every player's current stack, total invested and running profit or loss, sorted by stack.

## 7. Winning the pot

- **Showdown.** Once the river betting is finished, the screen title changes to "Showdown" and a **Pick the winner** card lists everyone still in as "Name wins" with the pot. A confirmation asks before the pot is given.
- **Split pot.** Choose "Split between two or more", then tap everyone who ties; untapped players say "Tap to include". The screen shows each player's share, and once at least 2 are chosen a "Split ₹X N ways" button appears. Splits are equal; any leftover single chips go to the tied players in seat order. "Back to one winner" leaves split mode.
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
- **Between hands** (the button under the current hand): clears everything from the current hand, returns every chip including the blinds, and puts the dealer, blinds and hand number back to how they were before the hand was dealt.
- **Cancel hand:** refunds every chip from the current hand, including the blinds, and immediately deals a fresh hand with the same hand number. The dealer button moves on to the next player. To keep the same dealer, use Between hands instead.
- **Undo last hand:** reverses the last completed hand and deals it again exactly as it was first dealt: the same dealer, small blind and big blind, the same blind level (even for timed blinds that have since gone up), everyone's stacks and buy-ins from before it, and its log lines removed. If the next hand was already dealt, that hand is undone too, and any rebuy made in between is taken back. Only the most recent completed hand can be undone.
- **Discard game:** throws away the game in progress without saving. Asks for confirmation first.
- Every one of these asks for confirmation before anything changes.

## 10. The game on this device

- **Games in progress survive a refresh.** The current game is kept on the device, so closing or reloading the page doesn't lose it.
- **Tied to your account.** A game in progress is saved on the device for the signed-in host only. Another host signing in on the same device doesn't see it.
- **One device per game.** A game in progress lives on the device where it was started. It isn't synced to other devices until it's saved. Players can still follow it on their own phones through a live standings link (see section 19).
- **Back button works.** The phone or browser back button, and the ← button at the top of each screen, move back through the app's screens.

## 11. Saving a game and game history

- **Finish And Save Session** saves the game to your private history. It needs at least one completed hand. If a hand is still in progress, it's refunded and doesn't count in the saved results. After saving, the app opens the standings.
- **Saving twice is safe.** If a save is retried, for example after a network problem, the game is still saved only once and doesn't use up a second game number.
- **A different game can't hide behind a retry.** A retry only counts as the same save if it describes the same game: the same times, stakes, hands, blinds, players in the same seats, buy-ins and final chips. If a save arrives with the ID of an already saved game but different details, it is refused with "A different session with the same ID is already saved" and nothing is changed.
- **The server double-checks every save.** A game is rejected if the chip totals don't add up, the same player appears twice, or a number is invalid. A bad game can't reach your history.
- **Game history** is on the **Games** tab and lists saved games, newest first. The five most recent are shown. The button under the list, for example "Show 10 older games", adds 10 more at a time and says how many are left when more than 10 remain; the button moves down below the newly shown games. Once every game is shown, it becomes "Show fewer" and goes back to five. Each game card shows:
  - name or number, date, number of hands, big blind and number of players
  - each player's result, biggest winner first with a green **Win** tag (when they finished ahead), written as "+₹8,000" or "−₹2,000"
  - total buy-ins for any player who bought in more than once
  - blind history, when blinds changed during the game: each plan, the blinds used from each hand, and the blinds it finished at
- **Discard a game** to remove it from the standings and graph. It moves to a faded "Discarded" list under the saved games.
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
- **Everyone is ranked from their first game.** There's no minimum number of games, and the number of games is shown in each player's details.
- **Ties share a rank.** Two players with exactly the same score get the same rank.
- **What the score does not measure:** it doesn't adjust for luck, opponents, table size or how long a game lasted. It's a summary of results, not a skill rating.
- **How it works, in the app.** The small **i** button next to the "Player Standings" heading opens a small window with a one-sentence explanation of the ranking. Close it with **Got it**, by tapping outside it, or with the Escape key.
- **Each player's row shows** rank (in a green circle for 1st, blue for 2nd and 3rd), name and average return (to two decimal places). Tap a row to open or close its details:
  - **Sessions:** games played, for example 24. If some can't be ranked, it adds how many were, for example "24 (23 ranked)"
  - **Profitable:** games they finished ahead, with the percentage
  - **Hands:** total hands dealt in the games they played
  - **Invested:** total chips put in
  - **Net chips:** total chips won or lost
- **Games that can't be ranked.** If a game's saved chip totals don't add up, or a player put in no chips, that game is left out of the ranking. The row says which game and why, for example "Not ranked: Game 12 — the saved chip totals do not add up". All the other stats on the row count only ranked games, so they always describe the same games. A player with no rankable games shows as "Unranked", never as 0%.
- **Standings graph:**
  - It shows only the average return (there is no raw-chips view): each player's running average return after every game. A player's line starts at their first game; missed games keep their previous average rather than counting as zero. Dots mark the games that changed a score. Hovering or tapping a dot shows that game's return, the running average and how many games it's based on.
  - Each player has their own colour, the same one used for their initial during a game. Tap a name in the legend under the graph to highlight that player's line and fade the others; tap it again to show everyone.
- **Discarded games** don't count anywhere in the standings or graph until restored.
- The top 4 players are shown first. "Show all N players" under the list shows everyone; it then becomes "Show fewer" and goes back to 4.

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
- **Games from the old shared ledger** (the 32 games saved before 25 September 2026) were reviewed one by one and copied into the account of the host who ran them, numbered from Game 1 in that host's own ledger. Games whose host hasn't signed in yet stay hidden from everyone until they do.

## 17. Reference and help

- **Hand Rankings**, from the home screen tile. All ten hands from Royal Flush to High Card, each with a short description and five example cards; cards that aren't part of the hand are faded.
- **Poker rules**, from the home screen. They explain this table's house rules: setup, positions, turn order, minimum raises, buy-ins, splits and how to fix mistakes.

## 18. Devices and installation

- Designed for phones first. On tablets and desktops the app keeps the phone layout in a centred column up to 480 pixels wide.
- Can be added to a phone's home screen and opened like an app, full screen and without the browser bar.
- Respects the "reduce motion" setting for animations such as the seat-dragging effect.

## 19. Live standings for players

- **Share the game with the table.** During a game, the **Session Standings** card has a **Share live standings** button. **Create live link** makes a link and shows it as a QR code, with **Share link** (the phone's share menu, for example WhatsApp) and **Copy link**.
- **No sign-in for players.** Anyone who opens the link sees a read-only page. It shows the game name, the hand number (for example "Hand 12 in progress" or "After hand 12"), the blinds, and for every player: rank, stack, total bought in (including rebuys, with the number of rebuys) and net ▲/▼.
- **When the numbers change.** Stacks update after every action, so a player can check their chips before betting. Net and rank change only when a hand ends, so the order doesn't jump around during a hand.
- **How fast.** The host's phone sends each change about a second after the host stops tapping, at most once every 3 seconds. Players' phones check every 5 seconds while the page is open on screen, and at once when they come back to it.
- **Is the host still connected?** The page says "Updated 12s ago". While the host's phone is on, it also checks in once a minute when nothing has changed. After 2½ minutes without any update, the page warns that the host's phone may be offline or asleep.
- **Tap your name** to highlight your own row. The highlight is remembered on that phone.
- **What the link does not show:** other games, saved history, all-time standings, the action log, or anything else in the host's account.
- **When the link stops working.** It ends when the host saves or discards the game, taps **Stop sharing**, or deletes their account. It also stops 12 hours after the host's last update. Afterwards it shows "This game has ended". Sharing again makes a new link; old links never come back.
- **Who can see it.** Anyone who has the link can see those names and chip counts until it ends, so share it only with the table. The button reads "Sharing live · show link" while a link is active, and "Live link not updating" if the host's updates keep failing.

---

## Known gaps

These are known limitations, not planned features. Planned work is in the [feature plan](./FEATURE-PLAN.md).

- A game in progress can't be moved to another device before it's saved.
- The live standings link can't be used to play or change the game; only the host's device records it. If the host's phone is locked or offline, the link stops updating until the host opens the app again.
- Import handles up to 250 new games per file.
