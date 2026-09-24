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

export type BlindHistory = {
  plans: BlindPlan[];
  levels: BlindLevelRecord[];
};

export type GameState = {
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
  startedAt: number;
  players: Player[];
  hand: Hand | null;
  handNo: number;
  dealerIndex: number;
  log: string[];
  winnerAnnouncement?: WinnerAnnouncement | null;
  lastHand?: {
    stacksBefore: number[];
    buyInsBefore?: number[][];
  } | null;
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
  hands: number;
  results: SessionResult[];
};
