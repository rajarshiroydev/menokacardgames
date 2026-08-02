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

export type GameState = {
  gameName?: string;
  sessionLabel?: string;
  ante: number;
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
