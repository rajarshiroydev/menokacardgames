export type Player = {
  id?: string;
  name: string;
  stack: number;
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
  type: "fold" | "check" | "call" | "bet";
  chips: number;
  line: string;
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
  stacksBeforeHand: number[];
  dealerIndex: number;
  smallBlindIndex: number;
  bigBlindIndex: number;
  currentPlayer: number | null;
  splitSel?: number[] | null;
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
  } | null;
  _setupCount: number;
};

export type SessionResult = {
  playerId?: string;
  name: string;
  net: number;
  end: number;
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

export type LeaderboardEntry = {
  playerId?: string;
  name: string;
  net: number;
  sessions: number;
  hands: number;
  wins: number;
  best: number;
  worst: number;
};
