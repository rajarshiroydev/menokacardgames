export type Player = {
  id?: string;
  name: string;
  stack: number;
  /** Initial stack followed by each rebuy amount. */
  buyIns?: number[];
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
  stacksBeforeHand: number[];
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
  blindsBefore?: BlindSchedule | null;
  blindLevelsBefore?: BlindLevelRecord[];
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
  blindsBefore?: BlindSchedule | null;
  blindLevelsBefore?: BlindLevelRecord[];
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
  blindPlans?: BlindPlan[];
  blindLevels?: BlindLevelRecord[];
  startStack: number;
  /** Rebuy limits chosen at setup or edited between hands; absent is none. */
  rebuyRules?: RebuyRules;
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
  ante: number;
  blindHistory?: BlindHistory;
  startStack: number;
  /** Rebuy limits the game finished with; absent when there were none. */
  rebuyRules?: RebuyRules;
  hands: number;
  results: SessionResult[];
};
