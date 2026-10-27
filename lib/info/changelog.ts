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
        tag: "fixed",
        text: "The sign-in page no longer fails to load when your earlier sign-in has ended elsewhere, for example after signing out on every device.",
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
