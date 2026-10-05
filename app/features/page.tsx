import type { Metadata } from "next";
import Link from "next/link";

import { InfoPage } from "@/components/info-page";
import { APP_NAME } from "@/lib/brand";
import { DELETION_GRACE_PERIOD_DAYS, LIVE_VIEW_EXPIRY_HOURS } from "@/lib/info/legal";

export const metadata: Metadata = {
  title: `Features · ${APP_NAME}`,
  description: `Everything ${APP_NAME} does, explained simply.`,
};

type Feature = { name: string; text: string };
type FeatureGroup = { icon: string; title: string; lead: string; features: Feature[] };

/**
 * The plain-language tour of the app. docs/FEATURES.md is the exact,
 * detailed list; keep this page in step with it when behaviour changes.
 */
const GROUPS: FeatureGroup[] = [
  {
    icon: "♠",
    title: "Your private ledger",
    lead: "Sign in with your email and everything you record is yours alone.",
    features: [
      {
        name: "No passwords",
        text: "Type your email and open the sign-in link we send you. You stay signed in as long as you open the app at least once a week.",
      },
      {
        name: "Private by default",
        text: "Your players, games and standings belong to your account. Other hosts never see them, even if you both know someone with the same name.",
      },
      {
        name: "Works like an app",
        text: "Add Pokerize to your home screen and it opens full screen. It's built for phones, and works on tablets and computers too.",
      },
      {
        name: "Dark and light",
        text: "Switch themes with the sun or moon button on Profile. Your phone remembers the choice.",
      },
    ],
  },
  {
    icon: "♦",
    title: "Setting up a game",
    lead: "Pick who's playing and how the chips work, then deal.",
    features: [
      {
        name: "Seat players",
        text: "Tap players in the order they sit (up to 10), and drag them to change seats. The first dealer is drawn at random unless you switch it off.",
      },
      {
        name: "Stacks and blinds",
        text: "Choose a starting stack and the app suggests a big blind to match. Small stacks (under 1,000) count in cents automatically.",
      },
      {
        name: "Odd blinds",
        text: "Want a small blind that isn't half the big blind? Turn on odd blinds and pick it.",
      },
      {
        name: "Rising blinds",
        text: "Keep the blinds fixed, or raise them every few hands or minutes, by multiplying or adding. You see the next levels before you start.",
      },
      {
        name: "Rebuy limits",
        text: "Allow unlimited rebuys, none, or a set number per player, and optionally stop rebuys once the blinds reach a certain size.",
      },
    ],
  },
  {
    icon: "♣",
    title: "Playing a hand",
    lead: "Cards are dealt for real; Pokerize keeps track of every chip.",
    features: [
      {
        name: "Positions move for you",
        text: "The dealer button and blinds move round the table each hand, and blinds are posted automatically.",
      },
      {
        name: "Only the right player can act",
        text: "The player whose turn it is glows green and sees exactly what it costs to call and the smallest legal bet or raise.",
      },
      {
        name: "Quick betting",
        text: "Fold, check, call or bet in one tap. Use the slider, type an amount, or tap ⅓ Pot, ½ Pot, Pot or All in.",
      },
      {
        name: "Real poker rules",
        text: "Minimum raises, short all-ins and side pots follow the standard rules, so an all-in player only wins what others matched.",
      },
      {
        name: "Know the tap counted",
        text: "Each action makes a soft click and a green flash. You can turn the click off in Settings.",
      },
      {
        name: "List or Table view",
        text: "See the hand as a list of seat cards or as an oval poker table. Your phone remembers which you like.",
      },
      {
        name: "Showdown",
        text: "Pick the winner, split a pot between players who tie, or award each side pot separately. Confetti included.",
      },
    ],
  },
  {
    icon: "♥",
    title: "Fixing mistakes",
    lead: "Wrong button? Every fix asks before it changes anything.",
    features: [
      {
        name: "Undo",
        text: "Take back the last action in the betting round, cancel the whole hand and deal it again, or undo the last finished hand.",
      },
      {
        name: "Edit as you go",
        text: "Between hands you can change the blind plan or the rebuy limits, and buy busted players back in.",
      },
      {
        name: "Nothing lost on refresh",
        text: "The game in progress is kept on your phone, so closing the app or reloading doesn't lose it.",
      },
    ],
  },
  {
    icon: "♠",
    title: "Saved games",
    lead: "Finish a game to keep it in your history.",
    features: [
      {
        name: "Game history",
        text: "The Games tab lists every saved game with results, buy-ins and the blinds used.",
      },
      {
        name: "Continue a game",
        text: "Pick a saved game back up another day, with everyone's chips and buy-ins as they were.",
      },
      {
        name: "Checked for you",
        text: "Every save is double-checked: the chips must add up, so a broken game can't reach your history.",
      },
      {
        name: "Backups",
        text: "Export your games to a file, and import a backup later. Importing never duplicates a game you already have.",
      },
    ],
  },
  {
    icon: "♦",
    title: "Standings",
    lead: "See who's really winning, fairly.",
    features: [
      {
        name: "Average return",
        text: "Players are ranked by their average profit as a percentage of what they put in, so a big game and a small game count the same.",
      },
      {
        name: "A graph over time",
        text: "Watch each player's average change game by game. Tap a name to highlight their line.",
      },
      {
        name: "The details",
        text: "Tap a player for games played, how often they finished ahead, hands, chips put in and net result.",
      },
    ],
  },
  {
    icon: "♣",
    title: "Friends",
    lead: "Connect with other Pokerize players.",
    features: [
      {
        name: "Your user code",
        text: "Every account has a code like 7KQ4-M2XP. Share it, show it as a QR code, or scan a friend's to send a request.",
      },
      {
        name: "Friends and guests",
        text: "Friends have their own accounts and choose their own name and avatar. Guests are people you record who don't have an account.",
      },
      {
        name: "Group standings",
        text: "When a friend hosts games you play in, you can see standings built only from those games, ranked among the people you sat with.",
      },
      {
        name: "Notifications",
        text: "The bell on Profile shows friend requests waiting for you and new friendships.",
      },
    ],
  },
  {
    icon: "♥",
    title: "Live standings",
    lead: "Let the table follow the game on their own phones.",
    features: [
      {
        name: "Share a link",
        text: "Create a live link or QR code during a game. Players open it without signing in and see blinds, stacks and buy-ins.",
      },
      {
        name: "Always up to date",
        text: `Stacks update a few seconds after each action. The link ends when the game is saved or discarded, or ${LIVE_VIEW_EXPIRY_HOURS} hours after the last update.`,
      },
    ],
  },
  {
    icon: "♠",
    title: "Your profile",
    lead: "You, your record and your players in one place.",
    features: [
      {
        name: "Your record",
        text: "All-time net, your last 10 games, games played, average return and how often you finish ahead, across your games and friends' games.",
      },
      {
        name: "Avatars",
        text: "Pick one of 20 drawn faces for yourself and each guest. No photos are ever uploaded.",
      },
      {
        name: "Currency",
        text: "Choose the currency sign for games you host: ₹, $, €, £ and more. It's a label for chips; nothing is converted.",
      },
      {
        name: "Settings",
        text: "Sounds, this page, What's New, the privacy policy, terms and account deletion.",
      },
    ],
  },
  {
    icon: "♦",
    title: "Safety and privacy",
    lead: "Hard to lose things by accident, easy to leave for good.",
    features: [
      {
        name: "Two steps to delete",
        text: "Players and games are removed first and can be restored. Deleting for good needs a sign-in from the last 10 minutes.",
      },
      {
        name: "Delete your account",
        text: `Your data is locked straight away, and you have ${DELETION_GRACE_PERIOD_DAYS} days to change your mind before it's permanently deleted.`,
      },
      {
        name: "No ads, no tracking",
        text: "We don't sell your data, show ads or use tracking cookies.",
      },
    ],
  },
];

export default function FeaturesPage() {
  return (
    <InfoPage
      page="features"
      intro={
        <p>
          {APP_NAME} is a chip ledger for home poker nights. It keeps track of
          every bet, blind and buy-in, so you can focus on the cards. It never
          handles real money. Here is everything it does.
        </p>
      }
    >
      {GROUPS.map((group) => (
        <section className="glass info-section feature-group" key={group.title}>
          <h2>
            <span className="feature-suit" aria-hidden="true">
              {group.icon}
            </span>
            {group.title}
          </h2>
          <p className="feature-lead">{group.lead}</p>
          <dl className="feature-list">
            {group.features.map((feature) => (
              <div key={feature.name}>
                <dt>{feature.name}</dt>
                <dd>{feature.text}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
      <p className="info-note">
        See what changed recently in <Link href="/whats-new">What&apos;s New</Link>.
      </p>
    </InfoPage>
  );
}
