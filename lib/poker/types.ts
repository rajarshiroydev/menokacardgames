export type RaiseRule = "ante" | "double" | "free";

export type Player = {
  id?: string;
  name: string;
  stack: number;
};

export type PlayerProfile = {
  id: string;
  name: string;
  createdAt: number;
};

export type PlayerAction = {
  type: "fold" | "check" | "call" | "bet";
  chips: number;
  line: string;
  prevRaise?: number;
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
  lastRaise: number;
  stacksBeforeHand: number[];
  splitSel?: number[] | null;
};

export type GameState = {
  ante: number;
  startStack: number;
  startedAt: number;
  raiseRule: RaiseRule;
  players: Player[];
  hand: Hand | null;
  handNo: number;
  log: string[];
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
  date: number;
  ended: number;
  ante: number;
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
