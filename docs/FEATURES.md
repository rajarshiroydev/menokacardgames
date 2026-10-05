# Feature list

Updated: 2 October 2026

This is a plain-language list of everything Pokerize can do today. It is written for anyone, technical or not. It describes how the app behaves right now; plans and future ideas live in the [feature plan](./FEATURE-PLAN.md).

**Keeping this list current:** whenever a feature is added, changed or removed, update its entry here in the same piece of work, and change the date above. If a rule has a specific number (a time limit, a minimum, a maximum), write the number down, because those are the details that get forgotten.

**A note on money:** the app is a chip ledger. It does not handle real money, payments or cards. Each host picks a currency on their Profile (section 3); every amount in their games, standings and live link is shown with that currency's sign as a label for chips. Nothing is ever converted between currencies.

---

## 1. Signing in and your private ledger

- **Sign in with your email, no password.** Enter your email address and the app emails you a one-time sign-in link. Opening the link signs you in. Each link works once and expires after five minutes.
- **Open the link in the same browser.** The sign-in only applies to the browser that opens the link. If you request a link on your phone but open it on your laptop, the laptop is signed in, not the phone. In app previews that keep their own browser, copy the link from the email and paste it into that browser's address bar.
- **Staying signed in.** A sign-in lasts about a week on that device. The **⋯** button beside your name on the Profile card shows "Signed in as" your email address, with **Edit name**, **Sign out** and **Delete my account** (section 14).
- **Save your name first.** Right after signing in, an account without a name sees only a "What should friends call you?" screen. Type your name (1 to 40 characters; extra spaces are tidied up), pick an avatar from the 20 below it (the random one you were given is ringed in green until you tap another; since 1 October 2026) and press **Save and continue** to open the app. The name and avatar are saved together. The button stays greyed out while the name is blank. There is no skip; **Sign out** at the top is the only other way out. This happens once: afterwards you can change the name on the Profile screen (section 3).
- **Every host has a private ledger.** The person who signs in is the *host*. Each host has their own friend list, games, history and standings. Two hosts never see each other's data, even if they both have a friend called "Rajarshi". The same friend in two hosts' lists is two separate records with separate histories.
- **Friends don't need accounts.** Friends are just names in the host's list. Only the host signs in.
- **Only the app can change your data.** Requests that add, change or delete data are accepted only when they come from the app's own pages. A request sent from another website, or by a script without the browser's origin information, is refused, even if you are signed in.
- **Locked accounts.** While an account is waiting to be deleted, all of its data is blocked and hidden. Signing in shows the "Deletion is scheduled" screen instead of the ledger (see section 14).

## 2. Home screen and getting around

Home (redesigned 1 October 2026) is a summary of where things stand; the tab bar handles getting around. From the top:

- **The Pokerize logo and name.** The logo is a glowing stack of green-and-blue poker chips topped with a spade (see section 18).

- **Your name**, large, under "Good morning", "Good afternoon" or "Good evening" (from your phone's clock; evening from 5 pm to 5 am), or "Game in progress" while a game is on. Long names wrap onto a second line.
- **One game card.** With no game running it's the green **Start a game** card, which opens table setup. While a game is on it becomes a **Live** card showing the game name, hand number and stage (or "Between hands"), the **pot** (or how many hands have been dealt, between hands), the blinds (with the level, such as "L2", when they rise on a schedule), **your stack** (or how many players are at the table, if you aren't seated) and the **chip leader** with their stack. Tap anywhere on it, or **Back to the table**, to return to the game.
- **Unassigned device data**: appears only if this device has games saved before accounts existed (see section 16).
- **Friend request notice**: appears when someone has sent you a friend request, with their avatar and name ("Meera wants to be friends", or "Meera and 2 others want to be friends"). **Review** opens the Profile tab, where you answer it. It's checked when the app opens and each time you come back to Home.
- **Last session**: your most recent saved game, with its date, name, number of hands and players. It shows your result and your return when you played in it (otherwise the top winner's), the top winner on the right, and a bar for every player's win or loss. Tap it to open the Games tab. Hidden until you have a saved game.
- **Hand rankings** (all ten poker hands), see section 17.
- There is no standings summary on Home; see the Ranks tab.
- **Background:** behind Home, a fanned hand of glass cards (A♠ K♥ Q♣ J♦ 10♠) at the top right with a soft blue glow, in both themes. Other screens keep the green and blue lights and faint pitch lines.
- **Tab bar.** A bar at the bottom of every screen has five tabs: **Home**, **Play** (the game in progress, or table setup when there isn't one), **Ranks** (standings), **Games** (saved game sessions) and **Profile** (you and your players, section 3; its icon is a small person, the others are card suits). The current tab is highlighted in green. A green dot on **Play** means a game is in progress; a blue dot on **Profile** means friend requests are waiting.
- **Every other screen** shows its title at the top left (for example **Profile** or **Hand 12**) with no line above it. Profile also has the theme button at the top right. There is no on-screen back button; use the phone's back gesture or the browser's back button.
- **Title Case everywhere.** All text on every page (buttons, labels, notes, messages, the live link and the sign-in pages) starts each word with a capital, and headings are in capitals. The messages quoted in this list are shown that way in the app. Text boxes keep what you type, and email addresses and links keep their exact case.
- **Dark and light themes.** A round theme button shows a **sun** in dark mode (tap for light) and a **moon** in light mode (tap for dark). In the app it's only on the **Profile** tab (since 1 October 2026); it's also on the pages outside the app: the sign-in page, the name screen, the locked-account page and the live standings link. The choice is remembered on that device. Dark is the default.

## 3. Profile (you and your players)

The **Profile** tab replaced the Players tab on 30 September 2026. From the top:

**Your card**

- **Your avatar**, in a green-and-blue ring, next to your name. Tap it (it has a small ✎ badge) to choose another; see **Avatars** below.
- **Your name**, large, with an **⋯** account menu beside it: "Signed in as" your email, **Edit name**, **Sign out** and **Delete my account**. **Edit name** turns the name into a box with **Save** (1 to 40 characters; Escape cancels). Under the name: "Playing since" the month of your first counted game, or "No games yet".
- **All-time net**: everything you've won or lost, in your currency. It's green when you're ahead and red when you're behind.
- **Last 10**: one small bar for each of your latest games (up to 10, in your currency), green up for a win and red down for a loss, taller for bigger results. Hover or long-press a bar for its date and result.
- **Three tiles:** **Games played**, **Avg return** (your average session return, section 12, to one decimal) and **Profitable** (games you finished ahead, for example 15/24).
- **Which games count.** Every game you played in: the games you host yourself (as your own player, see "You" below) and the games your friends host where they've linked you (section 20). A game counts exactly when it would count in that host's standings.
- **Other currencies.** Games hosted in a different currency count in the three tiles, but not in the all-time net or the bars, because amounts in different currencies are never added together. The card then says, for example, "Net leaves out 6 games played in another currency".
- **Your user code** (two groups of four, for example 7KQ4-M2XP) with **Copy** (it shows "Copied" for a moment) and a **QR** button that opens **User code**: **My Code** shows your code as a QR for a friend to scan, and **Scan Code** opens the camera to scan theirs (section 20). The **⋯** button offers **Replace code**: you get a new random code straight away, the old one stops working, and existing friends stay (section 20).
- **Currency.** Choose the currency for the games you host: ₹ INR (the default), $ USD, € EUR, £ GBP, A$ AUD, C$ CAD, S$ SGD, AED, ৳ BDT or ¥ JPY. It changes the sign on every amount in your games, saved history, standings, profile and live link straight away, including a game in progress and past games. Friends who look at your standings see your currency.

**Friend requests** sent to you appear as cards under your card (section 20).

**Players**

- **The heading** says how many active players you have, with a green **+ Add** button.
- **Filters:** **All**, **Friends** (you, your friends and requests you've sent) and **Guests** (players without an account), each with its count.
- **Each row** shows the player's avatar, name and a short line (no money amounts; wins and losses are on the Ranks tab):
  - **You**, for your own player (no game count);
  - **Friend · Played 21 games together**, for a friend, with a green-and-blue ring around their avatar (your own avatar has the same ring);
  - **Request sent · waiting**, for someone you've sent a friend request;
  - **Guest · Played 26 games together**, for everyone else.
  The count is every saved game you both played in, whoever hosted it ("Played 1 game together" for one): your own games, a friend's games and games hosted by someone else. A game hosted by someone else counts only while that host has each of you linked as a friend (not as a guest). It is worked out again each time Profile opens, so when a host links you later, their earlier games count too, and removing a friend or link takes them out. For guests it counts your own games where you both sat. Until the counts load, rows show just Friend or Guest.
  The list starts with you, then friends, then waiting requests, then guests; within each group, most games first.
- **Names.** People with an account go by the name they chose themselves: a friend shows as their own saved name, and your own player as your name. Only guests can be renamed.
- **Options.** Tap **⋯** on a row, or press and hold it (about half a second), for its options. Near the bottom of the screen they open upwards. Tap outside or press Escape to close them.
  - **Guest:** **View standings** (opens Ranks with their card open), **Link to friend…** (only when a friend could be them, section 20), **Rename**, **Change avatar** and **Remove player**.
  - **You:** **View standings** only.
  - **Friend:** **View standings** and **Unfriend** (section 20).
  - **Request sent:** **Cancel request**.
  - **View standings** appears only once the player has played.
- **Add a player.** **+ Add** opens a sheet with two choices:
  - **Find Friend:** type their user code and press **Find**, or scan their QR with the scan button beside **Find**, then **Send request** (section 20).
  - **Add Guest:** pick their avatar from the 20 under the name box (one is picked at random and ringed in green until you tap another; since 1 October 2026), then **Add**. Names are 1 to 80 characters; extra spaces are tidied up. Names are compared ignoring capital letters, so "Soham" and "soham" are the same player; a name you already have shows "You already have a player called Soham". Adding a removed player's name brings back that same player instead of making a second one, with the avatar you picked.
- **Rename a guest.** A small sheet with their name to edit and **Save**. The new name can't match another of your players. Their standings and future games use the new name; saved games keep the name each game was played under. Results stay with the player, not the name.
- **You.** Every account has its own player in its own list, tied to the account, not to a name. It's made automatically when you save your name after first signing in, and there's nothing to set up. It always shows your current name (change it on your card), comes first in the list and on Table Setup (marked **You**), and can't be renamed, removed or linked to a friend. You seat it when you play in your own game, so those games count on your card. Accounts that hosted before this existed had their existing player tied to them in a one-off step, confirmed by the account owner.
- **Avatars** (added 1 October 2026). Nobody uploads a photo; everyone shows as one of 20 drawn cartoon people, including two with a hijab and two with a turban. Everyone gets one at random until it's changed. You pick your own on the name screen after signing up, and a guest's when you add them.
  - **Yours:** tap your avatar on your card. A sheet shows all 20 (five to a row) with yours ringed in green; tapping one saves it straight away ("Avatar Saved"). Every host who has you as a friend sees the one you chose, the same way they see the name you chose.
  - **A guest's:** **⋯ → Change avatar** opens the same sheet. Only guests' avatars can be changed this way; a friend's is theirs to choose.
  - **Where they show:** your card, the player list, friend requests and the find-a-friend result, the seating order on Table Setup, every seat at the table (with the D, SB and BB badges), buy-in and split-pot choices, the Ranks cards (yours and friends' groups), and the live standings link.
  - Games saved before avatars, and anyone the app can't match to a player, show a stand-in avatar picked from their name, so the same name always gets the same one.
- **Remove a player** (after a confirmation) to hide them from new games. Their past results stay in the history and standings.
- **Removed players.** "Show 2 removed players" under the list shows them faded, marked "Removed · history kept" (or just "Removed" if they never played). Their options are **Restore**, and **Delete permanently** when all of these are true:
  - they have been removed first
  - they have never appeared in a saved game (players with saved history can never be permanently deleted, so the records stay complete)
  - they aren't linked to a friend
  - you signed in within the last 10 minutes (see section 13)

## 4. Starting a game

- **Game name (optional).** If left empty, the game is called "Game" plus the next number in your ledger, for example "Game 25". Numbers count up separately for each host.
- **Select players.** Every player on your friend list appears as a button, with you first, marked **You**. Tap players to seat them; the order you tap is the seating order, and each seated player shows their seat number. Tap a seated player again to take them off the table. There's no seated count or "need 2" note: **Deal First Hand** stays unavailable until two are seated. Up to 10 players can be seated; once 10 are seated, the others can't be tapped.
- **Seating Order.** Once two or more are seated, a **Seating Order** list shows the seats in order. Drag a player by the grip (⠿) to change seats, or use the arrow keys on the grip. A **Randomize dealer** switch beside the heading is **on by default**: the first dealer is drawn at random from the seated players when **Deal First Hand** is pressed, so nobody sees it during setup. Off, seat 1 deals first. Either way the dealer then moves round the table in seat order. Its **i** button opens a sheet with two lines, **Randomize Dealer On** (chosen at random when the game starts) and **Randomize Dealer Off** (seat 1 deals first); it closes with **Got it**, a tap outside it or Escape, like the other **i** sheets.
- **Starting stack / first buy-in.** Quick choices of 5K, 10K (the default), 20K and 50K chips, or **Other** to type any amount of at least 1.
- **Big blind.** Quick choices of 50, 100 (the default), 200, 500 and 1K, shown with your currency's sign (₹50 for rupees), or **Other** to type any amount of at least 1.
- **Odd blinds.** A switch beside the Big Blind heading, off by default. An **i** button beside it explains briefly what odd blinds are and that the small blind is otherwise half the big blind.
  - **Off:** the small blind is half the big blind, rounded down.
  - **On:** a **Small Blind** row appears with quick choices worked out from the big blind (25%, 40%, 60%, 75% and 100% of it; for ₹100 that's ₹25, ₹40, ₹60, ₹75 and ₹100, with ₹40 picked) or **Other** to type any amount. It must be from ₹1 up to the big blind; otherwise a message shows and Deal First Hand stays unavailable.
  - **Rising blinds keep the share:** ₹40/₹100 becomes ₹80/₹200, then ₹160/₹400, rounded to whole rupees.
  - The table, the "blinds go up" notices, the game log, saved games in the Games screen and the live standings link all show the real small blind.
- **Blind levels.** **Fixed**, **By Hands** or **By Minutes**. See section 5.
- **Deal First Hand** only becomes available when at least two different players are seated and the numbers are valid. It starts the game and deals hand 1.

## 5. Blinds

- **Fixed blinds** stay the same all game unless you change them.
- **Rising blinds** go up automatically. You choose:
  - how often: every so many **hands** or every so many **minutes** (at least 1). Choosing By Hands starts at every 10 hands; By Minutes starts at every 20 minutes
  - how: **multiply** the big blind (for example ×2, minimum ×1.1) or **add** a fixed amount (at least 1). On the setup screen this Multiply / Add fixed amount choice comes first, above the "Every" and "Multiply by" (or "Add ₹") boxes
  - the setup screen previews the next few big blind levels, for example 100, 200, 400, 800
- **Blinds never change mid-hand.** A new level always starts when the next hand is dealt. For timed blinds, if the time runs out during a hand, the increase waits for the next deal.
- **Blinds are easy to see.** During a hand, the current blinds appear in large numbers in a pill right under the pot, with a level badge (for example "L2") when blinds rise. The same pill appears between hands. Inside it is the countdown to the next level: hands left for hand-based levels, or minutes and seconds for timed ones (this keeps counting between hands). When the blinds go up, a short message says so.
- **Edit Blind Plan** between hands. You can switch rising blinds on or off or change the schedule. Changes start with the next dealt hand, and the screen shows when the new plan begins.
- **Blind history is saved** with each game (see section 11).

## 6. Playing a hand

- **Positions rotate automatically.** Each hand the dealer button, small blind and big blind move to the next player in seat order who still has chips. With only two players left, the dealer posts the small blind. A badge on each player's initial shows **D** (dealer), **SB** or **BB** (both, "D SB", for the heads-up dealer).
- **Seat cards.** Each player has a card with their initial in their own colour, their stack and how much they have put in this street, and a status such as Waiting, Small blind ₹50, Big blind ₹100, Checked, Called ₹200, Bet ₹100, Raised to ₹700, All in ₹2,000 or Folded. Folded players are faded and listed last.
- **Blinds are posted automatically** when a hand is dealt. A player with fewer chips than the blind posts what they have.
- **Stages:** pre-flop, flop, turn and river, shown as a progress bar. Cards are dealt physically; the app only tracks chips.
- **Only the highlighted player can act**, marked "Your turn" with a green outline. Their card shows how much they need to call and the minimum bet or raise. Raises are shown as the total the bet reaches, the way players say it at the table: for example "Min raise ₹1,300" for a player who already has ₹1,100 in. A player who can't cover the minimum sees "All in" and their stack instead. An **i** button beside the minimum explains the standard rule in one line with the hand's own numbers: min raise = current bet + last raise (for example ₹100 + ₹100 = ₹200), or, with no bet yet, that the smallest bet is the big blind (hidden when the player may only call or fold).
- **Actions:**
  - the three buttons, left to right, are **Fold**, **Check** or **Call ₹X**, and **Bet / Raise**
  - **Check** when nothing is owed
  - **Call ₹X** the current bet; the button shows what calling costs
  - **Bet / Raise**: the button shows the amount and bets it in one tap. It starts at the minimum, for example "Bet ₹100". A raise shows the total it reaches, for example "Raise ₹1,300". Once a bet stands (before the flop the big blind counts), putting in more is always called a raise, so the big blind's own raise also reads "Raise".
  - **Amount box**: the large green number on the right of the card. It shows the minimum until you type an exact amount. The box, slider and quick buttons are always the chips to put in now, not the total.
  - **Bet slider**: a slider snaps to exact amounts: the minimum, 1.5×, 2×, 5× and 10× the minimum (for example ₹100, ₹150, ₹200, ₹500, ₹1,000), then the player's whole stack. The button follows the slider; at the far end it reads "All in" and puts in the whole stack. Steps that would reach the stack are skipped, and a player who can't cover the minimum sees only All in.
  - **Quick buttons** under the slider: **⅓ Pot**, **½ Pot** and **Pot** (a third, half or all of the pot, never below the minimum or above the stack) and **All in**. The one you tap turns green and stays green until you type, slide or tap another.
  - While an amount other than the minimum is chosen, Check/Call and Fold are switched off, so an entered bet can't be lost by pressing the wrong button. "Clear amount to call or fold", or sliding back to the start, switches them back on.
  - **Fold**
  - **All in**: the quick button or the end of the slider; the button puts in the player's whole stack, even if it's less than a full call
- **Minimum amounts:**
  - when nobody has bet yet on a street, the minimum bet is the big blind
  - a raise must add at least as much as the last bet or raise on the same street. Before the flop the big blind counts as the first bet, so the first raise goes to at least twice the big blind (blinds ₹50/₹100: raise to ₹200). If someone then raises to ₹400 (₹300 more), the next raise must go to at least ₹700
  - each new street (flop, turn, river) starts again at the big blind
  - a player can always go all in for less
- **Short all-ins.** An all-in that raises by less than the minimum is a "short all-in". Players who already acted must still call it or fold, but they can't raise again: their row shows only Call and Fold, with a note saying why. Players who haven't acted yet on that street can still raise. A later full raise lets everyone raise again. The action log marks it as "short of a full raise".
- **A raise reopens the betting.** The round ends only when every player still in has called, checked, folded or gone all in. The blue button that deals the next street always names it ("Deal FLOP", "Deal TURN" or "Deal RIVER"); it is faded and can't be pressed until the round ends. It sits under the seat cards and stays in the same spot while you play: when a player's action ends the round, their card stays open (greyed out, marked "Betting round complete · Deal FLOP next", with Undo still available) until the next street is dealt, so the Deal button doesn't jump. At the river it is replaced by the Pick the winner card.
- **Pot and stages.** A scoreboard at the top shows the four stages as a bar (finished stages green, the current one green-blue), the pot in very large numbers and the blinds. Very large pots shrink to fit on one line.
- **Everyone else folds:** the last player left wins the pot automatically.
- **All-in run-out:** once betting can't continue (for example, everyone else is all in), the host can deal the remaining stages straight to the showdown without more betting.
- **Action log:** a running list of what happened (bets, calls, folds, wins, buy-ins, blind changes), newest first, keeping the latest 80 entries. The 6 newest are shown; "Show all" opens the rest.
- **In-game standings:** every player's current stack, total invested and running profit or loss, sorted by stack.
- **List or Table view.** During a hand, a **List | Table** switch sits top right. List is the seat cards described above. Table draws the hand as an oval poker table (seat 1 at the top, the rest clockwise), with everything else on the screen unchanged:
  - in the middle: the four stages as small bars, "Pot · Flop" (or "Pick the winner" / "Split the pot" at the showdown), the pot and the blinds (with the level, for example "₹50 / ₹100 · L2"). A blind schedule note shows under the table
  - each seat shows the player's avatar with its D/SB/BB badge, first name, stack and status (on the table the blinds read "SB ₹50" and "BB ₹100"). The player to act has a green glowing ring and "To act"; folded players are faded
  - chips in front of a seat show what that player has put in this street
  - the acting player's betting panel (the same as in List, headed "Name to act" with their stack behind) is docked under the table. When the round ends it gives way to the Deal button
  - **Undo** on the table: tap a player who has acted this street and a bar with their last action and an **Undo** button appears under the table. A dashed box under **Cancel hand** says "Tap on player to undo their action." (hidden at the showdown)
  - the choice is remembered on this device; it starts on List. Between hands both views show the same Between Hands card, so the switch is hidden

## 7. Winning the pot

- **Showdown.** Once the river betting is finished, the screen title changes to "Showdown" and a **Pick the winner** card lists everyone still in as "Name wins" with the pot. A confirmation asks before the pot is given.
- **On the Table view** the seats of everyone still in turn blue and read "Tap to award"; tapping a seat asks the same confirmation as the Pick the winner card, which stays under the table. In a split, tapped seats turn green ("In split"), the others read "Tap to add".
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
- **Cancel hand:** refunds every chip from the current hand, including the blinds, and immediately deals a fresh hand with the same hand number. The dealer button moves on to the next player.
- **Undo last hand:** reverses the last completed hand and deals it again exactly as it was first dealt: the same dealer, small blind and big blind, the same blind level (even for timed blinds that have since gone up), everyone's stacks and buy-ins from before it, and its log lines removed. If the next hand was already dealt, that hand is undone too, and any rebuy made in between is taken back. Only the most recent completed hand can be undone.
- **Discard game:** throws away the game in progress without saving. Asks for confirmation first.
- Every one of these asks for confirmation before anything changes.

## 10. The game on this device

- **Games in progress survive a refresh.** The current game is kept on the device, so closing or reloading the page doesn't lose it.
- **Tied to your account.** A game in progress is saved on the device for the signed-in host only. Another host signing in on the same device doesn't see it.
- **One device per game.** A game in progress (including a continued saved game, section 11) lives on the device where it was started. It isn't synced to other devices until it's saved. Players can still follow it on their own phones through a live standings link (see section 19).
- **Back button works.** The phone's back gesture or the browser's back button moves back through the app's screens.

## 11. Saving a game and game history

- **Finish And Save Session** saves the game to your private history. It needs at least one completed hand. If a hand is still in progress, it's refunded and doesn't count in the saved results. After saving, the app opens the standings.
- **Saving twice is safe.** If a save is retried, for example after a network problem, the game is still saved only once and doesn't use up a second game number.
- **A different game can't hide behind a retry.** A retry only counts as the same save if it describes the same game: the same times, stakes, hands, blinds, players in the same seats, buy-ins and final chips. If a save arrives with the ID of an already saved game but different details, it is refused with "A different session with the same ID is already saved" and nothing is changed.
- **The server double-checks every save.** A game is rejected if the chip totals don't add up, the same player appears twice, or a number is invalid. A bad game can't reach your history.
- **Game history** is on the **Games** tab, headed **My Hosted Games**, and lists saved games, newest first. The five most recent are shown. Under the list, **Show 10 more games** adds 10 more at a time, and beside it **Show all games** (with how many are left) shows the whole list at once; it only appears while more than 10 are left. The buttons move down below the newly shown games. Once every game is shown, a single **Show fewer** button goes back to five. Each game card shows:
  - name or number, date, number of hands, big blind and number of players
  - each player's result, biggest winner first with a green **Win** tag (when they finished ahead), written as "+₹8,000" or "−₹2,000"
  - total buy-ins for any player who bought in more than once
  - blind history, for every game (tap to open): each plan, the blinds used from each hand, and the blinds it finished at. Games saved before 18 September 2026 kept no record, and blinds couldn't change then, so they show fixed blinds at their starting big blind with a half-size small blind
- **No Discard button for now.** Since 1 October 2026 game cards have no **Discard** button (it may come back if people ask). Games discarded before then stay in a faded "Discarded" list under the saved games.
- **Restore a game** to count it again. Standings and graph update straight away.
- **Permanently delete a game** only after it has been discarded, and only within 10 minutes of signing in (see section 13).
- **Continue a saved game.** Every saved game card (not discarded ones) has a **Continue game** button, for any game, however long ago it was saved. It asks for confirmation first, and isn't allowed while another game is in progress ("Finish or discard the game in progress first").
  - The game opens between hands, so busted players can buy in before the next deal. Everyone keeps their seat, the chips they finished with and their buy-ins, under their current name. Hand numbers carry on (after 95 hands the next is hand 96), and the log starts with "Continued from Game 6 after 95 hands".
  - The dealer isn't saved with a game, so the next dealer is drawn at random.
  - Blinds carry on from where the game finished. Blinds that go up every few hands keep counting hands. Blinds that go up every few minutes restart their clock at the current blinds, so time away from the table doesn't raise them.
  - Until it's saved again, the saved game stays exactly as it was. **Discard Game** on a continued game throws away only the hands played since.
  - **Finish And Save Session** updates the same game: same number, name and date, with the new end time, hands, results and blind history; standings and friends' groups follow. If no new hand was completed, it offers **Close game** instead, which ends the continued game and leaves the saved game exactly as it was. If the saved game was changed or discarded since it was continued (for example from another device), nothing is saved: "This game changed since you continued it".

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
- **The heading.** "Player Standings" sits between the graph and the list, with only its **i** button beside it. A friend's group uses the same heading (see section 20).
- **How it works, in the app.** The small **i** button next to the "Player Standings" heading opens a small window. Its first line says whose ranking this is: "This is the overall ranking of everyone who has played in sessions you hosted." Below that is a one-sentence explanation of the ranking. Close it with **Got it**, by tapping outside it, or with the Escape key.
- **Current names.** A renamed guest, and a friend who changed their name, show under their current name, even for games saved under an older one.
- **You.** Your own player (section 3) is marked **You**.
- **Each player's row shows** rank (in a gold circle for 1st, silver for 2nd and bronze for 3rd; the live standings link uses the same colours), name and average return (to two decimal places). Tap a row to open or close its details:
  - **Sessions:** games played, for example 24. If some can't be ranked, it adds how many were, for example "24 (23 ranked)"
  - **Profitable:** games they finished ahead, with the percentage
  - **Hands:** total hands dealt in the games they played
  - **Invested:** total chips put in
  - **Net:** total won or lost, in the host's currency
- **Games that can't be ranked.** If a game's saved chip totals don't add up, or a player put in no chips, that game is left out of the ranking. The row says which game and why, for example "Not ranked: Game 12 — the saved chip totals do not add up". All the other stats on the row count only ranked games, so they always describe the same games. A player with no rankable games shows as "Unranked", never as 0%.
- **Standings graph:**
  - Its title, **Average Return**, sits above the graph's card, styled like the **Player Standings** heading, with no subtitle.
  - It shows only the average return (there is no raw-chips view): each player's running average return after every game. A player's line starts at their first game; missed games keep their previous average rather than counting as zero. Dots mark the games that changed a score. Hovering or tapping a dot shows that game's return, the running average and how many games it's based on.
  - Each player has their own colour, the same one used for their initial during a game. Tap a name in the legend under the graph to highlight that player's line and fade the others; tap it again to show everyone.
- **Discarded games** don't count anywhere in the standings or graph until restored.
- The top 4 players are shown first. "Show all N players" under the list shows everyone; it then becomes "Show fewer" and goes back to 4.

## 13. Safety for permanent deletion

- **Discard first, delete second.** Nothing can be permanently deleted without being discarded first (for players, **Remove player** on the Profile tab). Discarding can always be undone.
- **Recent sign-in required.** Permanent deletion only works if you signed in within the last **10 minutes**. This protects against someone using a phone or laptop that was left signed in.
- **If your sign-in is older,** the app explains why and offers to email you a new sign-in link. Open it on the same device, then delete again.
- **Only your own data.** A host can never delete, or even see, another host's players or games.
- **The 10-minute window may change** once we see how it works in practice.

## 14. Deleting your account

- **Delete my account** is in the **⋯** account menu beside your name on the Profile card, under "Signed in as", **Edit name** and **Sign out**. A confirmation explains exactly what happens before anything changes, as a short list of points (locked and hidden straight away, signed out everywhere, 30 days to recover, then permanent). The 6-hour provider backups are described under Backups below, not in the confirmation.
- **Recent sign-in required.** Like permanent deletion, it only works within **10 minutes** of signing in. Otherwise the app offers to email a fresh sign-in link.
- **What happens straight away:**
  - your players, games and standings are locked and hidden
  - you are signed out on **every** device, not just this one
  - the game in progress on this device is cleared
  - the sign-in page confirms the account is locked
  - your friends no longer see you among their friends, and you drop out of their requests (see section 20); the players they linked to you stay in their lists
- **30 days to change your mind.** Sign in again with the same email within **30 days** to see the "Deletion is scheduled" screen. It shows when you asked and the exact date and time everything will be deleted. Press **Recover my account** and everything comes back exactly as it was.
- **After 30 days** the account can no longer be recovered. An automatic check runs once a day (around 08:30 India time) and permanently deletes every account whose 30 days are up:
  - first the sign-in identity, so the email can no longer sign in to it
  - then the account and everything in it: players, games, results, buy-ins, records, your code and name, your friend requests and friendships. Friends keep the players and games in their own lists, no longer linked to you
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

- **Hand Rankings**, from its row on the home screen. All ten hands from Royal Flush to High Card, each with a short description and five example cards; cards that aren't part of the hand are faded.

## 18. Devices and installation

- Designed for phones first. On tablets and desktops the app keeps the phone layout in a centred column up to 480 pixels wide.
- Can be added to a phone's home screen and opened like an app, full screen and without the browser bar. The home-screen icon, the browser tab icon and the mark on the sign-in, name and locked-account screens are all the Pokerize logo: a glowing stack of green-and-blue poker chips topped with a spade.
- Respects the "reduce motion" setting for animations such as the seat-dragging effect.

## 19. Live standings for players

- **Share the game with the table.** During a game, the **Session Standings** card has a **Share live standings** button. **Create live link** makes a link and shows it as a QR code, with **Share link** (the phone's share menu, for example WhatsApp) and **Copy link**.
- **No sign-in for players.** Anyone who opens the link sees a read-only page. From the top: the game name, the current blinds in large type, then every player's card with rank, their avatar (as in the host's list), stack (in large type), net ▲/▼ and **Buy-In** (everything they've bought in, including rebuys, with the number of rebuys), and finally the hand status (for example "Hand 12 in progress" or "After hand 12") with when it was last updated.
- **When the numbers change.** Stacks update after every action, so a player can check their chips before betting. Net and rank change only when a hand ends, so the order doesn't jump around during a hand.
- **How fast.** The host's phone sends each change about a second after the host stops tapping, at most once every 3 seconds. Players' phones check every 5 seconds while the page is open on screen, and at once when they come back to it (after unlocking the phone, switching back from another app, or getting the network back). A check that gets no answer within 8 seconds is dropped and tried again, so a bad connection can't stop the page from updating.
- **Is the host still connected?** The page says "Updated 12s ago". While the host's phone is on, it also checks in once a minute when nothing has changed. After 2½ minutes without any update, the page warns that the host's phone may be offline or asleep. If instead the player's own phone can't reach the app, the page says "This phone can't reach the app" and keeps trying.
- **Tap your name** to highlight your own row. The highlight is remembered on that phone.
- **What the link does not show:** the host's player list, other games, saved history, all-time standings, the action log, or anything else in the host's account.
- **When the link stops working.** It ends when the host saves or discards the game, taps **Stop sharing**, or deletes their account. It also stops 12 hours after the host's last update. Afterwards it shows "This game has ended". Sharing again makes a new link; old links never come back.
- **Who can see it.** Anyone who has the link can see those names and chip counts until it ends, so share it only with the table. The button reads "Sharing live · show link" while a link is active, and "Live link not updating" if the host's updates keep failing.

## 20. Friends

Everyone who signs in has their own account and can host their own games. Friends connect two accounts, so each appears as a player in the other's list and can be seated in the other's games. Everything is on the **Profile** tab (section 3).

**Your code and name**

- **Your user code.** Eight characters shown as two groups of four (for example 7KQ4-M2XP) on your Profile card. Every account gets one automatically. It uses only letters and numbers that can't be confused (no 0, O, 1, I or L). The **copy** button (a copy icon) copies it and briefly shows a green tick. Share it with friends so they can send you a request. The **QR** button beside it opens **User code** with two tabs: **My Code** shows the code as a QR code (with the code written under it), and **Scan Code** opens the camera (section 20).
- **Replace your code.** **⋯ → Replace code** gives you a new random code straight away; the menu explains that the old code stops working and existing friends stay. There is no limit on how often you can replace it.
- **Your name** is the one on your Profile card (1 to 40 characters). Every account sets one straight after its first sign-in (section 1). You can change it at any time, but not remove it. Friends see it as your name in their player list.
- **Who can see them.** Someone who types your exact code sees only your name, never your email. There is no browsing or searching by name.

**Sending a request**

- **+ Add → Find Friend.** Type or paste a friend's user code (capitals, spaces and dashes don't matter) and press **Find**. The app shows their avatar and name with **Send request**, or says it's your own code, you're already friends, or a request is already waiting. An old player code (P-…, no longer shown in the app) gets its own message; a wrong or unknown code shows "No such user found".
- **Scan a friend's QR.** **Scan Code** on your Profile card, or the scan button beside **Find** in **Find Friend**, opens the back camera (the browser asks for permission the first time). Point it at the QR on their **My Code** tab: the code is read straight away and looked up as if you had typed it, with **Send request** when they can be added. QR codes that aren't a user code (a live standings link, say) show "That QR code isn't a user code" and scanning carries on. If camera access is blocked or there is no camera, it says so; **Type code instead** goes back to typing. Nothing is sent until you press **Send request**.
- **Send request.** You don't choose a player when sending; to tie them to a guest you already record, use **Link to friend…** on that guest after they accept (below). The sheet closes and they appear in your list as "Request sent · waiting", with **Cancel request** in their options.
- **Limits:** at most **20** of your requests can be waiting at once, and only one request can be waiting between two people, in either direction. If someone declines you, you can't ask them again for **7 days**.

**Answering a request**

- A request is a green-edged card under your Profile card: "Name wants to be friends", with **Accept** and **Decline** side by side, the same width.
- **Accept** makes you friends and adds them to your list as a new player under their name. If you already have a player with that name, the card asks you to type another name. If that player is one of your guests (active and not linked to anyone), the card instead says "*Name* is already one of your guests. Link them to keep their games, or choose another name" and shows a **Link to Guest *Name*** button above Accept and Decline: it makes you friends and links them to that guest, with no extra player made. Otherwise the card is just Accept and Decline. If they're really one of your guests under a different name (someone whose games you already record), use **Link to friend…** in that guest's options afterwards to move the link onto the guest and keep the guest's games. On their side, a new player is added under your name (with a number, such as "Rajarshi Roy (2)", if they already have a player of that name). Requests sent before 1 October 2026 may instead link a guest the sender chose.
- **Decline** ends the request. They can ask again after 7 days.

**Your friends**

- Friends are in your player list under **Friends**, by the name they chose, with how many of your games they played.
- **Link to friend…** (in a guest's options) ties the guest to one of your friends: pick the friend and press **Link**. The guest becomes the friend and keeps all their games; the player made for the friend when you became friends is deleted. The list holds only friends who could be that guest: friends not yet linked to a guest (still on the player made when the request was accepted) who became your friend after the guest was added. So the option isn't shown on a guest added after all your friendships, or once every friend is linked; friends' own options have no link. If the chosen friend's player already has games (you played with them before linking), the sheet warns "*Friend* already has N games in your list. They'll be merged into *Guest*. This can't be undone." and the button reads **Merge**: their games move to the guest, with every result, buy-in and net unchanged. Merging is refused if both played in the same game ("They both played in the same game, so they can't be merged"), and while the friend is seated in the game in progress on that device.
- **Unfriend** (in the friend's options, with a confirmation) ends the friendship and unlinks the players on both sides. Both of you keep the players and every game. Linking again needs a new friend request. Either person can unfriend the other.
- **When things update.** Your Profile stats, friends' groups on Ranks, requests, friends and the player list all load when the app opens. Each time you open a tab, it shows what was last loaded straight away and quietly checks for changes: Home and Profile recheck requests and friends, Profile also rechecks your stats, Ranks rechecks friends' groups, and Profile and Start a Game (table setup) recheck the player list. The list also reloads when a friend's player isn't in it yet. So a new or linked player shows up and can be seated without reopening the app.
- **What friends can see:** each other's name, and the standings of any host who has you as a linked player (see "Group standings" below). They never see your email, your saved games one by one, or anything they could change.

**Group standings (the Ranks screen)**

- **Your games and your groups.** When at least one host has you as a linked friend and has played at least one saved game with you, the top of the **Ranks** screen shows a green dropdown (the phone's own picker) of whose standings to show. **My Hosted Games** (your own standings, exactly as before) comes first, then each host's "Name's Hosted Games" in alphabetical order. Every entry shows its game count, for example "Meera's Hosted Games · 8 games". A friend who hasn't hosted a game you played in isn't listed (no "· 0 games" entries). With no such hosts there's no dropdown.
- **What a group shows:** the same **Average Return** graph as your own standings (every player's running average after each of that host's games, with a tappable legend), then that host's standings list, ranked exactly as the host sees it (same average session return, same ties): every player's rank, name, score and, when opened, Sessions, Profitable, Hands, Invested and Net (in that host's currency). Your own row is marked **You**. Between the graph and the list is the same **Player Standings** heading as on your own standings. Its **i** opens with "This is your overall ranking among everyone who has played in sessions hosted by Name.", followed by how players are ranked. The game count is in the dropdown. The screen title is just **Standings**, for your own games and for every group.
- **What a group doesn't show:** the host's game-by-game history, the running-average graph, the names of games left out of the ranking, discarded games, or anything you could change. The app works the standings out on the server and sends your phone only the list.
- **When it updates:** each time you open the Ranks screen.
- **When a group disappears:** as soon as either of you removes the friendship, or while the host's account is locked for deletion. There is no combined score across groups.

## 21. Admin dashboard

- **Who can open it:** only accounts the app's owner has added as admins, directly in the database. For everyone else `/admin` is an ordinary "page not found"; signed-out visitors go to sign-in.
- **Read only:** nothing on the dashboard changes anyone's data.
- **Overview:** number of signed-up users (new in the last 7 and 30 days), people who signed in during the last 7 days, guests, linked friends, games (last 7 and 30 days), hands dealt, total time at the table, hosts who played in the last 30 days, friendships, pending friend requests and live standings links in use; bar charts of sign-ups and games for each of the last 12 weeks; the newest users, the top 5 hosts by games hosted and the latest games.
- **Users:** every account with name, email, user code, join date, last sign-in, games hosted, games played as someone's friend, last game, guests, friends and status (Active, No name, Deleting, Purging). Search by name, email or code; filter All, Hosts, No name yet or Deleting; sort by any column. Selecting a user opens their detail: every player in their ledger with games, net and last played; their latest 50 games with each player's buy-in, rebuys, cash-out and net; friends; and pending requests. Each time a user's detail is opened it is recorded in the admin's audit log.
- **Guests:** every guest (a player who is neither a host's own player nor linked to an account) with code, the host who added them, date added, games, net and last played. Filter by host; removed guests are hidden unless **Show removed** is on.
- **Games:** the latest 300 games across all hosts with host, time, length, players, hands, big blind, chips won and winner; select a game to see every player's result.
- **System:** accounts waiting out their 30-day deletion period, the purge job's records, the 40 most recent audit events and the database migrations applied.
- Times are shown in India time. **Updated** reloads the data.

---

## Known gaps

These are known limitations, not planned features. Planned work is in the [feature plan](./FEATURE-PLAN.md).

- A game in progress can't be moved to another device before it's saved.
- Friend requests don't send notifications or emails; people see them when they open the Profile tab.
- The live standings link can't be used to play or change the game; only the host's device records it. If the host's phone is locked or offline, the link stops updating until the host opens the app again.
- Import handles up to 250 new games per file.
