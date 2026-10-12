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
  blindsBefore?: BlindSchedule | null;
  blindLevelsBefore?: BlindLevelRecord[];
  /** Rake taken in the game before this hand; older records lack it. */
  rakeBefore?: number;
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
  /** The host's currency when the game started; older games lack it (INR). */
  currency?: string;
  /**
   * "cents" when every amount in the game is in hundredths (blinds like
   * 0.25/0.50), chosen at setup. Absent is whole chips, as in older games.
   */
  chipUnit?: ChipUnit;
  /** Odd blinds chosen at setup; without it the small blind is half. */
  smallBlindRatio?: SmallBlindRatio;
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
  blindPlans?: BlindPlan[];
  blindLevels?: BlindLevelRecord[];
  startStack: number;
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
  _setupCount: number;
};

export type SessionResult = {
  playerId?: string;
  name: string;
  net: number;
  end: number;
  buyIns?: number[];
};

export type PokerSession = {
  id: string;
  name?: string;
  sessionNumber?: number;
  discardedAt?: number;
  date: number;
  ended: number;
  /** "cents" when every amount is in hundredths; absent is whole chips. */
  chipUnit?: ChipUnit;
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
