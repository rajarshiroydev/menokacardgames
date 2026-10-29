/**
 * What's New: the public feature log, newest release day first (user
 * decision 2026-10-05: by date, each item tagged New, Improved or Fixed).
 *
 * Add an entry in the same change as any user-visible behaviour, worded for
 * players, not developers. Dates are the day it reached production.
 * Only list changes players would notice or care about; developer work
 * (analytics, tooling, refactors) stays out (user decision 2026-10-13).
 */
export type ChangeTag = "new" | "improved" | "fixed";

export type ChangeItem = { tag: ChangeTag; text: string };

export type ChangelogEntry = {
  /** ISO date, YYYY-MM-DD. */
  date: string;
  /** A few words naming the release, shown under the date. */
  title: string;
  items: ChangeItem[];
};

export const CHANGE_TAG_LABELS: Record<ChangeTag, string> = {
  new: "New",
  improved: "Improved",
  fixed: "Fixed",
};

export const CHANGELOG: ChangelogEntry[] = [
  {
    date: "2026-10-29",
    title: "Avatars and safer sign-out",
    items: [
      {
        tag: "improved",
        text: "Changing your avatar or a guest's no longer saves on the first tap: try a few, then press Save Avatar.",
      },
      {
        tag: "new",
        text: "Settings has Sign Out Of All Devices, which signs you out on every phone and browser at once, for example after losing a phone.",
      },
      {
        tag: "improved",
        text: "Signing out now removes your game in progress and live link from the phone, so the next person can't see them. The game is backed up first and waits under Unfinished game when you sign back in.",
      },
      {
        tag: "improved",
        text: "For safety, you now sign in again with an email link every 90 days, even if you use the app every day.",
      },
    ],
  },
  {
    date: "2026-10-28",
    title: "A tidier List view and showdowns",
    items: [
      {
        tag: "new",
        text: "If someone buys back in and you stop before they play a hand with it, saving asks whether to keep that buy-in or take it back, so their results only count money they played with.",
      },
      {
        tag: "new",
        text: "The action log now keeps the whole session instead of the last 80 lines, and it's saved with the game: tap Action log on a saved game to read it, and Continue game picks it up where it left off. Older hands fold to their result until you tap them.",
      },
      {
        tag: "improved",
        text: "A clearer action log: each hand in its own box, split by street, with every player's avatar, a coloured tag for what they did and the amount on the right. Actions are numbered from 1 in each hand, so you can follow the order, wins stand out in green, and rebuys sit with cash-outs and new players under \"Before hand\", outside the hands.",
      },
      {
        tag: "improved",
        text: "Tap a highlighted bet size (⅓ Pot, ½ Pot, Pot or All in) again to clear it and empty the amount.",
      },
      {
        tag: "improved",
        text: "Showdowns with side pots are tidier: each pot's heading shows who still needs picking, then a green tick with the winner, and the award button counts the pots picked before showing the total to award. The split button reads Split this pot on every showdown.",
      },
      {
        tag: "fixed",
        text: "Changing the main pot's winner no longer clears a side pot you'd already picked, unless the new winner is in that side pot too.",
      },
      {
        tag: "improved",
        text: "Splitting a pot in List view keeps everyone's player cards on screen, as it already did with side pots.",
      },
      {
        tag: "improved",
        text: "The List view is laid out like the table: a smaller pot card on top, the other players as slim strips showing their stack, what they have in the hand and their last action, then the player to act with Deal, Undo and Cancel hand right under them. The strips move up a place each turn, so the betting buttons stay put and you scroll much less.",
      },
      {
        tag: "improved",
        text: "The Stack and In this hand boxes and the Fold, Check and Bet buttons are a little slimmer, in both views.",
      },
      {
        tag: "improved",
        text: "During a hand, Undo hand now sits beside Cancel hand, and both name their hand, like Undo hand 25 and Cancel hand 26, so you know exactly which hand each one changes.",
      },
      {
        tag: "improved",
        text: "Session standings show what each player started with and their buy-ins on their own row, like Start ₹10,000 · Buy-ins ₹20,000, and Share live standings now sits under the list. The live standings link shows the same.",
      },
      {
        tag: "new",
        text: "The live standings link now follows the hand: the pot, the street, who's to act and what everyone did, with dealer and blind badges. It also shows when the blinds go up next, who won the last hand, how players moved in the ranking, and the game so far: time and hands played, average stack, chips in play and the biggest pot.",
      },
      {
        tag: "new",
        text: "On the live link, tap your name to see when you're next in the big blind, how many rebuys you have left and a chart of how your game has gone.",
      },
      {
        tag: "improved",
        text: "In Table view the Deal Flop, Turn and River button no longer jumps up when a round ends. It stays in one place under the betting panel, as in List view. In both views the Deal and Undo buttons now stay on screen for the whole hand, greyed out when they can't be used.",
      },
      {
        tag: "improved",
        text: "In List view the Pick the winner card now opens once the river betting is over, as on the table, instead of sitting locked under the players while they still bet.",
      },
    ],
  },
  {
    date: "2026-10-27",
    title: "Easier invites and the right names",
    items: [
      {
        tag: "improved",
        text: "The page your guests open from a Pokerize invite now leads with who invited them, and its text is shorter and easier to read.",
      },
      {
        tag: "improved",
        text: "Joining from an invite takes fewer steps: saving your name accepts it, with no second \"Are you…?\" question. If you already have an account, one Accept invite button does it.",
      },
      {
        tag: "fixed",
        text: "Saved games now show everyone by the name they chose, and guests by their latest name, instead of the name a game was saved with: in your Games, Details, Settle up and Home, and in a friend's standings and games.",
      },
      {
        tag: "improved",
        text: "Friend requests no longer show the Pokerize badge beside the sender's name: everyone who sends one is on Pokerize.",
      },
      {
        tag: "improved",
        text: "Invite to Pokerize is now only in a guest's options on Profile, no longer on their card in Ranks.",
      },
      {
        tag: "fixed",
        text: "The sign-in page no longer fails to load when your earlier sign-in has ended elsewhere, for example after signing out on every device.",
      },
      {
        tag: "fixed",
        text: "Seats on the table now show each player's full name, the same as the standings and Pick the winner, instead of only the first name. Two players called Arjun no longer look alike.",
      },
      {
        tag: "improved",
        text: "Home's Last session now includes games you played at a friend's table, not only games you hosted. Tap it to open that friend's games.",
      },
      {
        tag: "improved",
        text: "Undo now works across streets. Right after the flop, turn or river is dealt, Undo takes that street back, then keeps stepping back through the actions before it, all the way to the start of the hand.",
      },
      {
        tag: "improved",
        text: "The betting card is easier to read: two tiles show the stack in large type and what the player has put in this whole hand.",
      },
      {
        tag: "improved",
        text: "The amount box starts empty and takes the total you're raising to, matching the Raise button. The bet slider is gone; the pot-size buttons and All in remain.",
      },
      {
        tag: "improved",
        text: "The button to split a pot is now easy to spot at the showdown, in blue with a split icon, and Back to one winner is a solid button too, instead of faint outlines.",
      },
      {
        tag: "improved",
        text: "On the table, tapping a player's seat no longer awards the pot. Pick the winner on the card under the table, so a stray tap can't hand out chips.",
      },
      {
        tag: "improved",
        text: "Buying in a busted player during a hand now has one place in both views: a Buy in card above Undo. Table seats and player cards no longer have their own buy-in buttons.",
      },
      {
        tag: "improved",
        text: "Picking the winner is clearer: tap a player to pick them, then press the green \"Name wins\" button under the list. No more popup, and the pot shows only beside the player you picked.",
      },
      {
        tag: "improved",
        text: "Showdowns with side pots work the same way: each pot has a clear heading with its amount, you tap a player to pick them, and Award pots turns green once every pot has a winner.",
      },
    ],
  },
  {
    date: "2026-10-26",
    title: "Fairer standings and friends' games",
    items: [
      {
        tag: "improved",
        text: "Link to friend… is now in every guest's options, so you can link any guest to a friend who isn't linked yet, however long you've been friends. If no friend is free, it tells you why.",
      },
      {
        tag: "new",
        text: "A Pokerize badge now sits after the name of everyone with a Pokerize account, on Profile and Ranks; tap it to see who it is. In a friend's standings you can tell at a glance who you can add as a friend: a badge without \"Friend\" means they're on Pokerize and one tap away.",
      },
      {
        tag: "new",
        text: "Add friends straight from a friend's standings: open the card of anyone you've played with and tap Add Friend. No code or QR needed. Requests you've sent now wait in the Profile bell. Standings now also mark each player as Friend or Guest, as on Profile.",
      },
      {
        tag: "new",
        text: "Invite your guests to Pokerize: send a guest a link from their options on Profile or their card on Ranks. When they join and confirm it's them, you become friends and their games move to their account.",
      },
      {
        tag: "improved",
        text: "A game's Details now show the starting stack (or each player's, when they differ) and every buy-in with its total, so the results list stays clean.",
      },
      {
        tag: "new",
        text: "Games now remember who joined late, who cashed out and when, and how many hands each player played. Look back at them under Details on any game you play from today, along with the starting small and big blind.",
      },
      {
        tag: "fixed",
        text: "A continued game with an odd small blind or with rake can be saved again.",
      },
      {
        tag: "new",
        text: "See the games you played at a friend's table. On Games, pick a friend's hosted games from the list at the top, just like on Ranks, to see each game you played there with everyone's results, its details, Settle up and its results card to share. Only the host can continue a game or change its chip value.",
      },
      {
        tag: "improved",
        text: "New players no longer jump to the top of the standings after one or two lucky games. Once 3 players have played 5 games, players with 4 games or fewer are hidden until you turn on Newcomers under Player Standings. New groups still see everyone, and you always see your own card.",
      },
      {
        tag: "improved",
        text: "Each player's standings details now show Total: what they put in plus what they won or lost.",
      },
      {
        tag: "improved",
        text: "In a friend's standings, every player's card now shows Invested, Total and Net across the games you played together, not just yours.",
      },
      {
        tag: "improved",
        text: "The names under the standings graph now read in rank order down the left column, then down the right.",
      },
      {
        tag: "new",
        text: "Switch the standings graph between Return % and Net to see each player's net profit or loss over time.",
      },
      {
        tag: "improved",
        text: "The standings graph now fits its height to the players' results, so the lines spread out and are easier to tell apart.",
      },
    ],
  },
  {
    date: "2026-10-13",
    title: "Quick ledger, settle up and Who wins?",
    items: [
      {
        tag: "new",
        text: "Settle up. After you save a game, Pokerize shows everyone's result in money and who pays whom, with the fewest payments possible. Share the list to your group chat in one tap. Settle up is also on every saved game in Games.",
      },
      {
        tag: "new",
        text: "Results card. Tap Share on any saved game for a picture of the night: the winner, everyone's result in chips and their return, ready to post in your group chat.",
      },
      {
        tag: "new",
        text: "Chip value. Chips don't cost what's printed on them? At setup, turn on Chips cost money and say what a buy-in costs, for example ₹500 for 10,000 chips. The table counts chips, and results, standings and settle up show real money. Forgot? Set the price later from Settle up.",
      },
      {
        tag: "new",
        text: "Quick ledger. Don't want to play every hand in the app? Tap Start a game on Home, choose Quick ledger, note buy-ins, rebuys and anyone who cashes out, then count everyone's chips at the end. It counts in the standings just like any other game.",
      },
      {
        tag: "new",
        text: "Who wins? Not sure whose hand is best? Tap Who wins? on Home, pick the players, enter the five community cards and each player's two cards, then tap Check winner. Pokerize names the winner and explains why, kickers and split pots included. Nothing is saved.",
      },
      {
        tag: "improved",
        text: "One place to start a game. Start a game on Home and the Play tab now open the same New Game screen, where you choose hand by hand or a quick ledger. Tournaments are coming soon.",
      },
      {
        tag: "improved",
        text: "Tidier saved games. Each game in Games now shows just the date, how it was played and how many players, with Share at the top and Details, Settle up and Continue game along the bottom. Tap Details for the rest: hands, blinds, chip value, rebuys, ante, rake and blind history.",
      },
    ],
  },
  {
    date: "2026-10-12",
    title: "Backups, late joins, own buy-ins, ante and rake",
    items: [
      {
        tag: "new",
        text: "Your game is backed up while you play. If your phone dies, open Pokerize on another phone or laptop and tap Restore game on Home to carry on from the same hand.",
      },
      {
        tag: "new",
        text: "Own amounts. Turn it on at setup and each player can buy in for a different amount. Forgot to turn it on? A late player can still pick their amount, and a rebuy has a Change amount link. Standings still compare everyone fairly by their return on what they put in.",
      },
      {
        tag: "new",
        text: "Late arrivals. Between hands, tap Add player, pick who's joining, where they sit and what they buy in for. They play from the next hand.",
      },
      {
        tag: "new",
        text: "Leaving early. Between hands, tap Cash out and pick who's going. The chips in front of them become their result. Tapped by mistake, or they came back? Return seats them again with the same chips.",
      },
      {
        tag: "new",
        text: "Big blind ante. Turn it on at setup and the big blind also puts in one big blind for the whole table each hand.",
      },
      {
        tag: "new",
        text: "House rake. Choose 2%, 3%, 5%, 10% or your own rate, with a most-per-hand limit. No flop, no rake.",
      },
      {
        tag: "new",
        text: "Turn the table. A button on the Table view moves every seat one place, so the screen matches where everyone really sits.",
      },
      {
        tag: "improved",
        text: "Easier undo. One button names what it takes back, like \"Undo Asha's call\", in both List and Table view. Tap again to step further back.",
      },
      {
        tag: "improved",
        text: "The bet amount now looks like a box you can type in, with an \"Enter amount\" label.",
      },
      {
        tag: "new",
        text: "Forgot a rebuy before dealing? Tap a busted player during the hand to buy them in. They sit that hand out and play from the next one.",
      },
      {
        tag: "improved",
        text: "Side pots fill themselves in. Pick the main pot's winner and every side pot they're in follows automatically.",
      },
      {
        tag: "improved",
        text: "A split pot's leftover chip now goes to the winner nearest the dealer's left, as in casinos.",
      },
      {
        tag: "new",
        text: "Pause the blind clock. In timed games, tap Pause beside the countdown for a break; the blinds wait where they were. Dealing the next hand starts the clock again.",
      },
      {
        tag: "fixed",
        text: "Timed blinds no longer leap ahead after a break. A table left open goes up one level on the next deal, the one the screen shows, and that level's clock starts then.",
      },
    ],
  },
  {
    date: "2026-10-05",
    title: "Side pots, cents and a busy day at the table",
    items: [
      {
        tag: "new",
        text: "Settings, on the Profile tab: sounds, this feature log, everything the app does, the privacy policy, terms of use and how account deletion works, all in one place.",
      },
      {
        tag: "new",
        text: "Side pots. An all-in player only wins what each opponent matched; the showdown lists every pot with the players who can win it.",
      },
      {
        tag: "new",
        text: "Small-stakes games count in cents automatically when the stack is under 1,000.",
      },
      {
        tag: "new",
        text: "Rebuy limits: choose how many rebuys each player gets and the big blind at which rebuys close.",
      },
      {
        tag: "new",
        text: "A notification bell on Profile for friend requests and new friendships.",
      },
      {
        tag: "new",
        text: "A click sound and a green flash when a player acts, so you know the tap counted. The sound can be switched off in Settings.",
      },
      {
        tag: "improved",
        text: "20 new hand-picked avatars in bright colours.",
      },
      {
        tag: "improved",
        text: "Friends now see a host's standings built only from the games they played in.",
      },
      {
        tag: "improved",
        text: "The quick bet you tap turns green, and ⅓ Pot replaces Min.",
      },
      {
        tag: "improved",
        text: "Clearer labels on the Average Return graph.",
      },
      {
        tag: "fixed",
        text: "You stay signed in as long as you open the app at least once a week.",
      },
      {
        tag: "fixed",
        text: "Dragging a seat sideways no longer pushes the tab bar off the screen.",
      },
      {
        tag: "fixed",
        text: "Cancel hand keeps the same dealer and blinds.",
      },
      {
        tag: "fixed",
        text: "No more win message hiding behind the winner card.",
      },
    ],
  },
  {
    date: "2026-10-02",
    title: "Table view and continued games",
    items: [
      {
        tag: "new",
        text: "Table view: see the live hand as an oval poker table, with a List | Table switch.",
      },
      {
        tag: "new",
        text: "Continue any saved game, with everyone's chips, buy-ins and blinds carried on.",
      },
      {
        tag: "new",
        text: "Show your user code as a QR code, and scan a friend's to add them.",
      },
      {
        tag: "new",
        text: "Link a guest to a friend later, keeping all of the guest's games.",
      },
      {
        tag: "new",
        text: "The first dealer is drawn at random (you can switch this off).",
      },
      {
        tag: "improved",
        text: "Small i buttons explain odd blinds and the minimum raise with the hand's own numbers.",
      },
      {
        tag: "improved",
        text: "Games played together now count games hosted by any friend.",
      },
      {
        tag: "improved",
        text: "Accepting a friend request offers to link a guest with the same name.",
      },
    ],
  },
  {
    date: "2026-10-01",
    title: "Pokerize, avatars and a new Home",
    items: [
      {
        tag: "new",
        text: "The app is now called Pokerize, with a new chip-stack logo.",
      },
      {
        tag: "new",
        text: "Avatars for every player, chosen by them or by their host.",
      },
      {
        tag: "improved",
        text: "A redesigned Home screen, with account controls moved to Profile.",
      },
      {
        tag: "improved",
        text: "Profile and Ranks open instantly with what was last loaded.",
      },
      {
        tag: "improved",
        text: "The delete-account confirmation lists exactly what will happen.",
      },
    ],
  },
  {
    date: "2026-09-30",
    title: "Profile tab and currencies",
    items: [
      {
        tag: "new",
        text: "A Profile tab with your all-time net, last 10 games and stats.",
      },
      {
        tag: "new",
        text: "Choose a currency for the games you host: ₹, $, €, £ and more.",
      },
      {
        tag: "fixed",
        text: "The player list reloads when a friend accepts your request on their phone.",
      },
    ],
  },
  {
    date: "2026-09-27",
    title: "Odd blinds and friends' standings",
    items: [
      {
        tag: "new",
        text: "Odd blinds: set a small blind that isn't half the big blind.",
      },
      {
        tag: "improved",
        text: "Pick whose standings to see from one dropdown on Ranks.",
      },
      {
        tag: "improved",
        text: "Faster loading, and live standings keep updating on players' phones.",
      },
    ],
  },
  {
    date: "2026-09-25",
    title: "Accounts, friends and live standings",
    items: [
      {
        tag: "new",
        text: "Everyone signs in with their email and gets their own private ledger.",
      },
      {
        tag: "new",
        text: "Friends: send requests with a user code and see the standings of the groups you play in.",
      },
      {
        tag: "new",
        text: "A live standings link players can open on their phones, no sign-in needed.",
      },
      {
        tag: "improved",
        text: "The Scoreboard redesign, with big numbers and glass cards.",
      },
    ],
  },
  {
    date: "2026-09-24",
    title: "Fairer rankings and safer deletion",
    items: [
      {
        tag: "new",
        text: "Standings rank players by average session return, so big and small games count the same.",
      },
      {
        tag: "new",
        text: "Delete your account, with 30 days to change your mind.",
      },
      {
        tag: "new",
        text: "Check a backup file before importing it.",
      },
      {
        tag: "improved",
        text: "A bet slider, blinds shown large, and raises shown as the total they reach.",
      },
      {
        tag: "improved",
        text: "Every rebuy is the full starting stack.",
      },
      {
        tag: "fixed",
        text: "Raises follow the standard minimum, and short all-ins don't reopen the betting.",
      },
      {
        tag: "fixed",
        text: "Undo last hand deals it again with the same dealer and blinds.",
      },
    ],
  },
  {
    date: "2026-09-19",
    title: "Rising blinds and a new look",
    items: [
      {
        tag: "new",
        text: "Rising blinds, by hands or by minutes, editable between hands.",
      },
      {
        tag: "new",
        text: "Buy-ins for busted players, run-outs after an all-in, and a standings graph.",
      },
      {
        tag: "improved",
        text: "The sporty glass design, and layouts for tablets and computers.",
      },
    ],
  },
  {
    date: "2026-07-27",
    title: "The first version",
    items: [
      {
        tag: "new",
        text: "Track a home poker game hand by hand: seats, blinds, bets, folds and winners.",
      },
      {
        tag: "new",
        text: "Saved games, a shared player list and hand rankings.",
      },
    ],
  },
];
