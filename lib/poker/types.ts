import type { ChipUnit } from "./money.ts";

export type Player = {
  id?: string;
  name: string;
  stack: number;
  /** Initial stack followed by each rebuy amount. */
  buyIns?: number[];
  /**
   * Cashed out and left the table: not dealt in, and `stack` is the chips
   * they left with, which is their result. Absent while seated.
   */
  left?: boolean;
  /**
   * Games that track players (`GameState.tracksPlayers`) only. Hands this
   * player was dealt into; hand-by-hand games only.
   */
  handsPlayed?: number;
  /**
   * Joined after the game began: the first hand they could be dealt
   * (hand-by-hand games) and when (ms). Absent for players there from the start.
   */
  joinedHand?: number;
  joinedAt?: number;
  /**
   * Cashed out: the last hand dealt before they left (hand-by-hand games)
   * and when (ms). Cleared if they return to the table.
   */
  leftHand?: number;
  leftAt?: number;
};

/**
 * How a game is recorded. "ledger" is a quick ledger: buy-ins, cash-outs and
 * the final chip count only, with no hands, blinds or dealer. Absent is a
 * game played hand by hand.
 */
export type GameKind = "ledger";

/** A quick-ledger change that Undo can take back (lib/poker/ledger.ts). */
export type LedgerStep = {
  /** The log line the change wrote, removed again by Undo. */
  line: string;
  /** Everyone as they were before the change. */
  players: Player[];
  customBuyIns: boolean;
};

export type PlayerProfile = {
  id: string;
  name: string;
  /** Shareable player code (see lib/accounts/identity-code.ts). */
  code: string;
  /** The avatar this player shows as (lib/avatars.ts). */
  avatar?: string;
  /** Linked to a friend's account by an accepted friend request. */
  linked: boolean;
  createdAt: number;
  discardedAt?: number;
  hasHistory?: boolean;
};

export type WinnerAnnouncement = {
  names: string[];
  pot: number;
  handNo: number;
  split: boolean;
  /** Each pot's winners, when the hand had side pots. */
  pots?: PotResult[];
};

/** A main or side pot and the players still in who can win it. */
export type Pot = {
  amount: number;
  eligible: number[];
};

/** How a pot was paid out, for the winner card. */
export type PotResult = {
  label: string;
  amount: number;
  names: string[];
};

export type PlayerAction = {
  type: "fold" | "check" | "call" | "bet" | "all-in";
  chips: number;
  line: string;
  /** Raise rules from just before this action, so undo can restore them. */
  raiseBefore?: RaiseRecord;
};

export type RaiseRecord = {
  size: number;
  open: boolean[];
  /** The action was a full raise, which changed the rules for everyone. */
  full: boolean;
  /** Who had acted this street before the action. Older actions lack it. */
  acted?: boolean[];
};

export type Hand = {
  no: number;
  pot: number;
  stage: number;
  in: boolean[];
  committed: number[];
  acted: boolean[];
  last: Array<PlayerAction | null>;
  roundHigh: number;
  /**
   * Size of the last full bet or raise this street; a raise must add at
   * least this much. Starts at the big blind. Older hands lack it.
   */
  raiseSize?: number;
  /**
   * Who may still raise this street. A player who acted loses the right
   * until someone makes a full raise, so a short all-in only lets them call
   * or fold. Older hands lack it, and everyone may raise.
   */
  raiseOpen?: boolean[];
  /**
   * Stacks at the deal. A player who buys in during the hand counts as having
   * had the new stack already, since they sit the hand out.
   */
  stacksBeforeHand: number[];
  /** Players who bought in during this hand; they play from the next one. */
  boughtIn?: number[];
  dealerIndex: number;
  smallBlindIndex: number;
  bigBlindIndex: number;
  currentPlayer: number | null;
  splitSel?: number[] | null;
  /** When the hand was dealt. Older hands lack it. */
  dealtAt?: number;
  /** State restored when a newly dealt hand returns to the between-hands page. */
  dealerIndexBefore?: number;
  anteBefore?: number;
  blindLevelBefore?: number;
  blindLevelStartedAtBefore?: number;
  /** `GameState.blindPausedMs` when the hand was dealt; absent before any pause. */
  blindPausedMsAtDeal?: number;
  blindsBefore?: BlindSchedule | null;
  blindLevelsBefore?: BlindLevelRecord[];
  /**
   * The big blind ante posted this hand: dead money in the main pot that
   * doesn't count toward the poster's bet. Absent without antes.
   */
  ante?: { playerIndex: number; amount: number };
};

/**
 * The house's cut, chosen at setup: `percent` (0.1 to 10, in steps of 0.1) of each pot
 * that sees a flop, at most `cap` chips a hand. No flop, no rake.
 */
export type RakeRules = {
  percent: number;
  cap: number;
};

/**
 * What chips cost in money: `chips` stored chips (in the game's chip unit)
 * cost `cents` hundredths of the host's currency. A game without one counts
 * a chip as one unit of the currency, as every game did before it existed.
 * Only results and settling up use it; the rules of play never do.
 */
export type ChipValue = {
  chips: number;
  cents: number;
};

export type BlindSchedule = {
  /** Levels advance every `every` hands, or every `every` minutes. */
  unit: "hands" | "minutes";
  every: number;
  /** Multiply the starting big blind, or add a flat amount each level. */
  raiseType: "multiply" | "add";
  raiseBy: number;
};

export type BlindPlan = {
  /** First hand dealt under this plan. */
  effectiveHand: number;
  /** When the plan was chosen; timed levels count from here. */
  effectiveAt: number;
  baseBigBlind: number;
  schedule: BlindSchedule | null;
};

export type BlindLevelRecord = {
  handNo: number;
  dealtAt: number;
  bigBlind: number;
};

/** What undo needs to deal the last completed hand again exactly. */
export type CompletedHand = {
  stacksBefore: number[];
  buyInsBefore?: number[][];
  /** Older games lack the fields below; undo then works them out. */
  handNo?: number;
  dealtAt?: number;
  dealerIndexBefore?: number;
  anteBefore?: number;
  blindLevelBefore?: number;
  blindLevelStartedAtBefore?: number;
  blindPausedMsAtDeal?: number;
  blindsBefore?: BlindSchedule | null;
  blindLevelsBefore?: BlindLevelRecord[];
  /** Rake taken in the game before this hand; older records lack it. */
  rakeBefore?: number;
  /** Each player's hands played before this hand (games that track players). */
  handsPlayedBefore?: number[];
};

/**
 * An odd small blind, as the share of the big blind chosen at setup (for
 * ₹40/₹100, small 40 and big 100). Absent means the usual half.
 */
export type SmallBlindRatio = {
  small: number;
  big: number;
};

export type BlindHistory = {
  plans: BlindPlan[];
  levels: BlindLevelRecord[];
  smallBlindRatio?: SmallBlindRatio;
};

/**
 * Rebuy limits the host chose for a game; null means no limit. Games without
 * them allow up to MAX_BUY_INS - 1 rebuys at any time (lib/poker/buy-ins.ts).
 */
export type RebuyRules = {
  /** Rebuys each player may make, not counting their first buy-in. */
  maxRebuys: number | null;
  /** Rebuys close once the big blind reaches this amount. */
  closeAtBigBlind: number | null;
};

/** The saved game a continued game updates, as it was when reopened. */
export type ContinuedSession = {
  id: string;
  sessionNumber: number;
  ended: number;
  hands: number;
};

export type GameState = {
  /**
   * "ledger" for a quick ledger. Such a game never deals a hand: `hand` stays
   * null, `handNo` 0, `ante` 0 and the blind fields empty, and a seated
   * player's `stack` is 0 until they cash out (their chips are counted when
   * the game is saved).
   */
  kind?: GameKind;
  /** Quick ledger only: changes Undo can take back, newest first. */
  ledgerUndo?: LedgerStep[];
  /** The host's currency when the game started; older games lack it (INR). */
  currency?: string;
  /**
   * "cents" when every amount in the game is in hundredths (blinds like
   * 0.25/0.50), chosen at setup. Absent is whole chips, as in older games.
   */
  chipUnit?: ChipUnit;
  /** Odd blinds chosen at setup; without it the small blind is half. */
  smallBlindRatio?: SmallBlindRatio;
  /**
   * What the chips cost, chosen at setup; absent is a chip per unit of the
   * currency. With it the game shows plain chip counts, not money.
   */
  chipValue?: ChipValue;
  gameName?: string;
  sessionLabel?: string;
  /** Big blind for the current level. */
  ante: number;
  /** Big blind the game started at. Older saved games fall back to `ante`. */
  baseAnte?: number;
  blinds?: BlindSchedule | null;
  blindLevel?: number;
  /**
   * When the current timed level began; it lasts `every` minutes from here.
   * Older games lack it and count from the plan's start instead.
   */
  blindLevelStartedAt?: number;
  /** When the host paused the blind clock; absent while it runs. */
  blindClockPausedAt?: number;
  /**
   * Total time the blind clock has been paused this game. Cancel hand and
   * Undo last hand never restore it, so a do-over can't take back a break.
   */
  blindPausedMs?: number;
  blindPlans?: BlindPlan[];
  blindLevels?: BlindLevelRecord[];
  /** The default buy-in, offered for every buy-in unless changed. */
  startStack: number;
  /**
   * Players choose their own buy-in amounts, with the starting stack as the
   * default: turned on at setup, or by the first rebuy or late join for a
   * different amount. It only changes how buy-ins are offered; any positive
   * amount is accepted either way. Absent is the same amount for everyone.
   */
  customBuyIns?: boolean;
  /** Rebuy limits chosen at setup or edited between hands; absent is none. */
  rebuyRules?: RebuyRules;
  /** The big blind also posts an ante of one big blind each hand. */
  bigBlindAnte?: boolean;
  /** The house's cut; absent is no rake. */
  rakeRules?: RakeRules;
  /** Chips the house has taken so far; absent is none. */
  rake?: number;
  startedAt: number;
  players: Player[];
  hand: Hand | null;
  handNo: number;
  dealerIndex: number;
  log: string[];
  winnerAnnouncement?: WinnerAnnouncement | null;
  lastHand?: CompletedHand | null;
  /** A saved game reopened to play on; saving updates that game. */
  continues?: ContinuedSession;
  /**
   * Records each player's hands played, late join and cash-out (games
   * started from 2026-10-26, and continued games saved with the record).
   * Absent in older games, which can't know those for hands already played.
   */
  tracksPlayers?: true;
  _setupCount: number;
};

export type SessionResult = {
  playerId?: string;
  name: string;
  net: number;
  end: number;
  buyIns?: number[];
  /**
   * Games that tracked players (see `Player`): hands dealt in (hand by hand
   * only; then every result has it), the first hand a late joiner could
   * play and when they joined, and the last hand before a cash-out and when.
   * Times are ms; hands are absent in quick ledgers.
   */
  handsPlayed?: number;
  joinedHand?: number;
  joinedAt?: number;
  leftHand?: number;
  leftAt?: number;
};

export type PokerSession = {
  id: string;
  /**
   * "ledger" for a quick ledger game: `hands` and `ante` are 0, and there is
   * no blind history, ante, rake or rebuy limit. Absent is hand by hand.
   */
  kind?: GameKind;
  name?: string;
  sessionNumber?: number;
  discardedAt?: number;
  date: number;
  ended: number;
  /** "cents" when every amount is in hundredths; absent is whole chips. */
  chipUnit?: ChipUnit;
  /**
   * What the chips cost; absent is a chip per unit of the currency. Set at
   * setup or later from Settle up; it isn't part of the game's content, so a
   * retried save matches whatever value is saved.
   */
  chipValue?: ChipValue;
  ante: number;
  blindHistory?: BlindHistory;
  startStack: number;
  /** Rebuy limits the game finished with; absent when there were none. */
  rebuyRules?: RebuyRules;
  /** Played with a big blind ante; absent is no ante. */
  bigBlindAnte?: boolean;
  /** The rake rules played with; absent is no rake. */
  rakeRules?: RakeRules;
  /**
   * Chips the house took. Players' results add up to minus this, so it is
   * part of the accounting check. Absent is none.
   */
  rake?: number;
  hands: number;
  results: SessionResult[];
};
