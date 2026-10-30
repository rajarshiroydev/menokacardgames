"use client";

import { useEffect, useMemo, useState } from "react";

import { friendsApi } from "@/components/ledger/api";
import { Avatar, toneClass } from "@/components/ledger/avatar";
import { InfoSheet } from "@/components/ledger/info-sheet";
import {
  chartLinesFromGroup,
  chartLinesFromStandings,
  LeaderboardChart,
} from "@/components/ledger/leaderboard-chart";
import { BadgedName, CurrencyContext, useMoney } from "@/components/ledger/money";
import type { GroupStandingRow, GroupStandings } from "@/lib/friends/group-standings";
import { formatPercent } from "@/lib/poker/game";
import {
  buildStandings,
  filterNewPlayers,
  type IneligibleReason,
  isNewPlayer,
  NEW_PLAYER_MAX_SESSIONS,
} from "@/lib/poker/standings";
import type { PlayerProfile, PokerSession } from "@/lib/poker/types";

const INELIGIBLE_REASON_TEXT: Record<IneligibleReason, string> = {
  "no-investment": "no chips were bought in",
  "unverified-accounting": "the saved chip totals do not add up",
};

const STANDINGS_START = 4;

/** What a standings row shows; shared by your own and a group's standings. */
type StandingCardEntry = {
  rank: number | null;
  name: string;
  playerId?: string;
  /** Sent with a friend's group, whose players aren't in your list. */
  avatar?: string;
  averageReturn: number | null;
  eligibleSessions: number;
  totalSessions: number;
  invested?: number;
  net?: number;
  hands: number;
  profitableSessions: number;
  isMe?: boolean;
};

function StandingCard({
  id,
  entry,
  open,
  onToggle,
  excluded,
  tag,
  onPokerize,
  badgeHint,
  action,
  markNew,
}: {
  id?: string;
  entry: StandingCardEntry;
  open: boolean;
  onToggle: () => void;
  excluded?: React.ReactNode;
  /**
   * What the player is to you, under their name, as on Profile: Friend or
   * Guest on your own standings; Friend on a friend's (user requests
   * 2026-10-26).
   */
  tag?: string | null;
  /** Has a Pokerize account: the badge after the name. */
  onPokerize?: boolean;
  /** Under the badge's "is on Pokerize" when it is tapped. */
  badgeHint?: string;
  /** Under the details: Add Friend, in a friend's standings. */
  action?: React.ReactNode;
  /** Label new players; off while everyone is shown for lack of regulars. */
  markNew: boolean;
}) {
  const { money, signedMoney } = useMoney();
  const profitableRate = Math.round(
    (entry.profitableSessions / entry.totalSessions) * 100,
  );
  const stats: Array<[string, string, number | null]> = [
    [
      "Sessions",
      entry.eligibleSessions === entry.totalSessions
        ? String(entry.totalSessions)
        : `${entry.totalSessions} (${entry.eligibleSessions} ranked)`,
      null,
    ],
    ["Profitable", `${entry.profitableSessions} (${profitableRate}%)`, null],
    ["Hands", entry.hands.toLocaleString("en-IN"), null],
  ];
  if (entry.invested !== undefined) {
    stats.push(["Invested", money(entry.invested), null]);
  }
  // What they ended with: chips put in plus the result, in hundredths so
  // amounts with cents add exactly.
  if (entry.invested !== undefined && entry.net !== undefined) {
    stats.push([
      "Total",
      money(Math.round((entry.invested + entry.net) * 100) / 100),
      null,
    ]);
  }
  if (entry.net !== undefined) {
    stats.push(["Net", signedMoney(entry.net), entry.net]);
  }
  const status =
    entry.averageReturn === null
      ? "Unranked · no verified buy-ins"
      : markNew && isNewPlayer(entry)
        ? "Newcomer"
        : null;
  const head = (
    <>
      <span
        className={`medal ${
          entry.rank === 1
            ? "gold"
            : entry.rank === 2
              ? "silver"
              : entry.rank === 3
                ? "bronze"
                : ""
        }`}
      >
        {entry.rank ?? "–"}
      </span>
      <Avatar
        name={entry.name}
        playerId={entry.playerId}
        avatar={entry.avatar}
        size="small"
      />
      <span className="standing-name">
        <b>
          <BadgedName
            name={entry.name}
            badge={Boolean(onPokerize)}
            isMe={entry.isMe}
            hint={badgeHint}
          />
          {entry.isMe ? <span className="you-tag">You</span> : null}
        </b>
        {tag || status ? (
          <small>
            {tag}
            {tag && status ? " · " : null}
            {status}
          </small>
        ) : null}
      </span>
      <span className={`standing-return ${toneClass(entry.averageReturn)}`}>
        {entry.averageReturn === null ? "—" : formatPercent(entry.averageReturn)}
      </span>
      <span className="chevron" aria-hidden="true">
        {open ? "▲" : "▼"}
      </span>
    </>
  );
  return (
    <section id={id} className="glass standing-card">
      <button
        className="standing-toggle"
        type="button"
        aria-expanded={open}
        onClick={onToggle}
      >
        {head}
      </button>
      {open ? (
        <div className="standing-details">
          <dl>
            {stats.map(([label, value, tone]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd className={toneClass(tone)}>{value}</dd>
              </div>
            ))}
          </dl>
          {excluded}
          {action}
        </div>
      ) : null}
    </section>
  );
}

/**
 * The Ranks screen: your own standings, plus the standings of every group
 * whose host has you as a linked friend.
 */
export function RanksView({
  groups,
  groupsError,
  onToast,
  onRequestSent,
  ...props
}: Parameters<typeof StandingsView>[0] & {
  /** Friends' groups, kept by the app so the picker shows at once. */
  groups: GroupStandings[];
  groupsError: string;
  onToast: (message: string) => void;
  /** After a friend request from a group's standings: reload friends. */
  onRequestSent: () => void;
}) {
  const [selected, setSelected] = useState("mine");
  const group = groups.find((item) => item.hostAccountId === selected);

  return (
    <div className="stack-list">
      <HostPicker
        label="Whose standings"
        groups={groups}
        selected={selected}
        onSelect={setSelected}
      />
      {groupsError ? <p className="muted small-note">{groupsError}</p> : null}
      {group ? (
        <GroupStandingsView
          group={group}
          onToast={onToast}
          onRequestSent={onRequestSent}
        />
      ) : (
        <StandingsView {...props} />
      )}
    </div>
  );
}

/**
 * My Hosted Games or a friend's hosted games, at the top of Ranks and Games.
 * Shown only when a friend's group has a game you played in.
 */
export function HostPicker({
  label,
  groups,
  selected,
  onSelect,
}: {
  label: string;
  groups: GroupStandings[];
  /** "mine", or a host's account id. */
  selected: string;
  onSelect: (id: string) => void;
}) {
  if (!groups.length) return null;
  // No game counts: a friend's group shows only games they played in, and a
  // count next to the host's name would read as the host's total.
  const options = [
    { id: "mine", label: "My Hosted Games" },
    ...groups.map((item) => ({
      id: item.hostAccountId,
      label: hostedGamesTitle(item.hostName),
    })),
  ];
  // One picker for any number of hosts: the phone's own list scales where
  // side-by-side buttons run out of room.
  return (
    <div className="standings-picker">
      <select
        className="select-control"
        aria-label={label}
        value={selected}
        onChange={(event) => onSelect(event.target.value)}
      >
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * The heading between the graph and the ranked list, shared by My Hosted
 * Games and every friend's group. Its "i" says whose ranking this is, then
 * how players are ranked.
 */
function StandingsHeading({
  intro,
  hidden,
}: {
  intro: string;
  /** For a friend's group: what is kept from you to protect other players. */
  hidden?: readonly string[];
}) {
  const [showRankingHelp, setShowRankingHelp] = useState(false);
  return (
    <>
      <div className="section-heading">
        <div className="heading-with-info">
          <h2>Player Standings</h2>
          <button
            className="info-button"
            type="button"
            aria-label="About these standings"
            onClick={() => setShowRankingHelp(true)}
          >
            i
          </button>
        </div>
      </div>
      {showRankingHelp ? (
        <RankingHelp
          intro={intro}
          hidden={hidden}
          onClose={() => setShowRankingHelp(false)}
        />
      ) : null}
    </>
  );
}

/**
 * The Newcomers switch with its "i", on a row of its own under the
 * standings heading: by the list it filters, not above the graph (user
 * decision 2026-10-26).
 */
function NewPlayersBar({
  showNew,
  onShowNewChange,
  applies,
}: {
  showNew: boolean;
  onShowNewChange: (show: boolean) => void;
  /** False while there are too few regulars: everyone shows, switch greyed. */
  applies: boolean;
}) {
  const [showHelp, setShowHelp] = useState(false);
  return (
    <>
      <div className="new-players-bar">
        <div className="heading-with-info">
          <label className="switch-row">
            <span>Newcomers</span>
            <button
              className="switch"
              type="button"
              role="switch"
              aria-checked={showNew || !applies}
              aria-label="Show newcomers"
              disabled={!applies}
              onClick={() => onShowNewChange(!showNew)}
            />
          </label>
          <button
            className="info-button"
            type="button"
            aria-label="About newcomers"
            onClick={() => setShowHelp(true)}
          >
            i
          </button>
        </div>
      </div>
      {showHelp ? (
        <InfoSheet label="About newcomers" onClose={() => setShowHelp(false)}>
          <ul className="info-sheet-list">
            <li>
              Players with {NEW_PLAYER_MAX_SESSIONS + 1} or more sessions are{" "}
              <b>regulars</b> and are shown in the rankings.
            </li>
            <li>
              Players with fewer than {NEW_PLAYER_MAX_SESSIONS + 1} sessions are{" "}
              <b>newcomers</b> and are hidden, so a few lucky games can&apos;t
              put them on top.
            </li>
          </ul>
          <p>Turn this on to include newcomers in the rankings.</p>
        </InfoSheet>
      ) : null}
    </>
  );
}

/** "Asha's Hosted Games": the name of another host's group on Ranks. */
function hostedGamesTitle(hostName: string | null) {
  return `${hostName ?? "Friend"}'s Hosted Games`;
}

function GroupStandingsView({
  group,
  onToast,
  onRequestSent,
}: {
  group: GroupStandings;
  onToast: (message: string) => void;
  onRequestSent: () => void;
}) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [showAll, setShowAll] = useState(false);
  const [showNew, setShowNew] = useState(false);
  // The graph's lines follow the rows, so the same players drop out of both.
  const allLines = useMemo(() => chartLinesFromGroup(group), [group]);
  const shown = useMemo(() => filterNewPlayers(group.rows, showNew), [group, showNew]);
  const rows = shown.rows;
  const lines = useMemo(
    () => shown.kept.map((index) => allLines[index]),
    [shown, allLines],
  );
  const visible = showAll ? rows : rows.slice(0, STANDINGS_START);
  const hostName = group.hostName ?? "Your friend";
  const newPlayersBar = group.rows.length ? (
    <NewPlayersBar
      showNew={showNew}
      onShowNewChange={setShowNew}
      applies={shown.applies}
    />
  ) : null;

  function toggle(index: number) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  // Amounts show in the currency this host counts their games in.
  return (
    <CurrencyContext.Provider value={group.currency}>
    <div className="stack-list">
      {lines.length ? (
        <LeaderboardChart sessionCount={group.games} lines={lines} />
      ) : null}
      {group.rows.length ? (
        <StandingsHeading
          intro={`Your ranking among the players you've sat with in games hosted by ${hostName}.`}
          hidden={GROUP_HIDDEN_INFO}
        />
      ) : null}
      {newPlayersBar}
      {rows.length ? (
        visible.map((row, index) => (
          <StandingCard
            key={`${row.name}-${index}`}
            entry={row}
            open={expanded.has(index)}
            onToggle={() => toggle(index)}
            markNew={shown.applies}
            tag={row.account?.relation === "friends" ? "Friend" : null}
            onPokerize={row.isMe || Boolean(row.account)}
            badgeHint={
              row.account?.relation === "none"
                ? "Open their card to add them as a friend."
                : undefined
            }
            action={
              row.account && row.account.relation !== "friends" ? (
                <StandingFriendRequest
                  key={`${row.account.id}-${row.account.relation}`}
                  name={row.name}
                  account={row.account}
                  onToast={onToast}
                  onRequestSent={onRequestSent}
                />
              ) : null
            }
          />
        ))
      ) : (
        <section className="glass card">
          <p className="muted">{hostName} hasn&apos;t saved any games yet.</p>
        </section>
      )}
      {rows.length > STANDINGS_START ? (
        <button
          className="glass-button full accent-text"
          type="button"
          onClick={() => setShowAll((shown) => !shown)}
        >
          {showAll ? "Show fewer" : `Show all ${rows.length} players`}
        </button>
      ) : null}
      {shown.pinnedSelf ? (
        <StandingCard
          entry={shown.pinnedSelf}
          open={expanded.has(-1)}
          onToggle={() => toggle(-1)}
          markNew
        />
      ) : null}
    </div>
    </CurrencyContext.Provider>
  );
}

function StandingsView({
  history,
  players,
  selfPlayerId,
  focusKey,
  loading,
  error,
  onRetry,
}: {
  history: PokerSession[];
  /** Current names: a renamed guest or a friend's chosen name wins over saved ones. */
  players: PlayerProfile[];
  selfPlayerId: string | null;
  /** A player's card to open and scroll to, from "View standings". */
  focusKey: string | null;
  loading: boolean;
  error: string;
  onRetry: () => void;
}) {
  const standings = useMemo(() => {
    const built = buildStandings(history);
    const byId = new Map(players.map((player) => [player.id, player]));
    const selfKey = selfPlayerId ? `id:${selfPlayerId}` : null;
    return {
      ...built,
      entries: built.entries.map((entry) => {
        const player = entry.playerId ? byId.get(entry.playerId) : undefined;
        return {
          ...entry,
          name: player?.name || entry.name,
          isMe: entry.key === selfKey,
          // A friend's account, as on Profile; anyone else is a guest.
          linked: Boolean(player?.linked),
        };
      }),
    };
  }, [history, players, selfPlayerId]);
  // "View standings" on a new player turns new players on, or the card
  // it opens would be hidden.
  const [showNew, setShowNew] = useState(() =>
    standings.entries.some((entry) => entry.key === focusKey && isNewPlayer(entry)),
  );
  const shown = useMemo(
    () => filterNewPlayers(standings.entries, showNew),
    [standings, showNew],
  );
  const leaderboard = shown.rows;
  const lines = useMemo(() => {
    const allLines = chartLinesFromStandings(standings);
    return shown.kept.map((index) => allLines[index]);
  }, [standings, shown]);
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(focusKey ? [focusKey] : []),
  );
  // A focused player past the first few opens the full list.
  const [showAll, setShowAll] = useState(
    () =>
      Boolean(focusKey) &&
      leaderboard.findIndex((entry) => entry.key === focusKey) >= STANDINGS_START,
  );
  useEffect(() => {
    if (!focusKey || loading) return;
    document
      .getElementById(`standing-${focusKey}`)
      ?.scrollIntoView({ block: "center" });
  }, [focusKey, loading, showAll]);
  const sessionTitles = useMemo(
    () =>
      new Map(
        history.map((session) => [
          session.id,
          session.name || `Game ${session.sessionNumber || ""}`,
        ]),
      ),
    [history],
  );
  const visible = showAll ? leaderboard : leaderboard.slice(0, STANDINGS_START);
  const newPlayersBar = (
    <NewPlayersBar
      showNew={showNew}
      onShowNewChange={setShowNew}
      applies={shown.applies}
    />
  );

  function toggle(key: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function standingCard(entry: (typeof leaderboard)[number]) {
    return (
      <StandingCard
        key={entry.key}
        id={`standing-${entry.key}`}
        entry={entry}
        open={expanded.has(entry.key)}
        onToggle={() => toggle(entry.key)}
        markNew={shown.applies}
        tag={entry.isMe ? null : entry.linked ? "Friend" : "Guest"}
        onPokerize={entry.isMe || entry.linked}
        excluded={
          entry.ineligible.length ? (
            <ul className="leaderboard-excluded">
              {entry.ineligible.map(({ sessionId, reason }) => (
                <li key={sessionId}>
                  Not ranked: {sessionTitles.get(sessionId) ?? sessionId}{" "}
                  — {INELIGIBLE_REASON_TEXT[reason]}
                </li>
              ))}
            </ul>
          ) : null
        }
      />
    );
  }

  if (error) {
    return (
      <section className="glass card">
        <p className="muted">{error}</p>
        <button className="glass-button full" type="button" onClick={onRetry}>
          Try again
        </button>
      </section>
    );
  }
  if (loading) {
    return (
      <section className="glass card">
        <p className="muted">Loading the shared ledger…</p>
      </section>
    );
  }
  if (!standings.entries.length) {
    return (
      <section className="glass card">
        <p className="muted">
          No saved sessions yet. Finish a game with “Finish And Save Session”
          and it will show up here.
        </p>
      </section>
    );
  }

  return (
    <div className="stack-list">
      {lines.length ? (
        <LeaderboardChart sessionCount={standings.timeline.length} lines={lines} />
      ) : null}

      <StandingsHeading intro="This is the overall ranking of everyone who has played in sessions you hosted." />
      {newPlayersBar}
      {visible.map(standingCard)}
      {leaderboard.length > STANDINGS_START ? (
        <button
          className="glass-button full accent-text"
          type="button"
          onClick={() => setShowAll((shown) => !shown)}
        >
          {showAll ? "Show fewer" : `Show all ${leaderboard.length} players`}
        </button>
      ) : null}
      {shown.pinnedSelf ? standingCard(shown.pinnedSelf) : null}
    </div>
  );
}

/**
 * A friend request to a player in a friend's standings who has an account
 * and isn't your friend yet: you sat at the same table, so you likely know
 * them (user request 2026-10-26). Friends are marked Friend under their
 * name instead, and a request you sent is listed in the Profile bell.
 */
function StandingFriendRequest({
  name,
  account,
  onToast,
  onRequestSent,
}: {
  name: string;
  account: NonNullable<GroupStandingRow["account"]>;
  onToast: (message: string) => void;
  onRequestSent: () => void;
}) {
  const [relation, setRelation] = useState(account.relation);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function send() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await friendsApi({ action: "send-coplayer", accountId: account.id });
      setRelation("request-sent");
      onToast("Request Sent");
      onRequestSent();
    } catch (error) {
      setError(error instanceof Error ? error.message : "The request was not sent");
    } finally {
      setBusy(false);
    }
  }

  // A request you sent shows in the Profile bell, not on the card.
  if (relation === "friends" || relation === "request-sent") return null;
  if (relation === "request-received") {
    return (
      <p className="standing-action muted">
        <span className="literal-text">{name}</span> sent you a friend request.
        Answer it on Profile.
      </p>
    );
  }
  return (
    <div className="standing-action">
      <button
        className="glass-button full"
        type="button"
        disabled={busy}
        onClick={() => void send()}
      >
        {busy ? "Sending…" : "Add Friend"}
      </button>
      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * What a friend's group leaves out, matching what the server sends
 * (lib/friends/group-standings.ts; user decisions 2026-10-05). Since
 * 2026-10-26 the games you played in are on Games with everyone's results,
 * so only other players' totals stay out of the standings.
 */
const GROUP_HIDDEN_INFO = [
  "Games you didn't play in",
  "Players you've never sat with",
  "How many games and players the host has in total",
] as const;

function RankingHelp({
  intro,
  hidden,
  onClose,
}: {
  intro: string;
  hidden?: readonly string[];
  onClose: () => void;
}) {
  return (
    <InfoSheet label="About these standings" onClose={onClose}>
      <p>{intro}</p>
      <p>
        Players are ranked by their <b>average session return</b>: how much
        they won or lost in each game as a percentage of the chips they put
        in, averaged over their games.
      </p>
      {hidden?.length ? (
        <>
          <p>
            <b>Hidden to protect other players&apos; privacy:</b>
          </p>
          <ul className="info-sheet-list">
            {hidden.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </>
      ) : null}
    </InfoSheet>
  );
}
