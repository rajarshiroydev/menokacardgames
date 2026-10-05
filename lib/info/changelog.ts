/**
 * What's New: the public feature log, newest release day first (user
 * decision 2026-10-05: by date, each item tagged New, Improved or Fixed).
 *
 * Add an entry in the same change as any user-visible behaviour, worded for
 * players, not developers. Dates are the day it reached production.
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
