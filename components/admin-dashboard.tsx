"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useMemo, useState, useTransition, type ReactNode } from "react";

import { AvatarArt } from "@/components/avatar-art";
import { BrandMark } from "@/components/brand-mark";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  accountLabel,
  formatDate,
  formatDateTime,
  formatDuration,
  gamePot,
  matchesQuery,
  relativeTime,
  sortRows,
  type AdminAccount,
  type AdminData,
  type AdminGame,
  type AdminGuest,
  type AdminView,
  type AdminWeek,
  type PlayerKind,
  type SortDirection,
} from "@/lib/admin/data";
import { APP_NAME } from "@/lib/brand";
import { formatMoney, formatSignedMoney } from "@/lib/poker/money";

const NAV: Array<{ view: AdminView; label: string; icon: ReactNode }> = [
  { view: "overview", label: "Overview", icon: <GridIcon /> },
  { view: "users", label: "Users", icon: <UsersIcon /> },
  { view: "guests", label: "Guests", icon: <GuestIcon /> },
  { view: "games", label: "Games", icon: <CardsIcon /> },
  { view: "system", label: "System", icon: <ServerIcon /> },
];

const TITLES: Record<AdminView, string> = {
  overview: "Overview",
  users: "Signed-up users",
  guests: "Guests",
  games: "Games",
  system: "System",
};

const SEARCH_HINTS: Partial<Record<AdminView, string>> = {
  users: "Search name, email or code",
  guests: "Search guest or host",
  games: "Search host, game or player",
};

/** Read-only admin dashboard. All data comes from the server page. */
export function AdminDashboard({
  data,
  initialView,
  detailId,
}: {
  data: AdminData;
  initialView: AdminView;
  detailId: string | null;
}) {
  const router = useRouter();
  const [view, setView] = useState<AdminView>(initialView);
  const [query, setQuery] = useState("");
  const [pending, startTransition] = useTransition();
  const now = data.overview.generatedAt;

  const counts: Partial<Record<AdminView, number>> = {
    users: data.accounts.length,
    guests: data.guests.filter((guest) => !guest.removed).length,
    games: data.overview.games.total,
  };

  function show(next: AdminView) {
    setView(next);
    setQuery("");
    window.history.replaceState(null, "", next === "overview" ? "/admin" : `/admin?view=${next}`);
  }

  function openAccount(id: string) {
    startTransition(() => {
      router.push(`/admin?view=${view}&user=${id}`, { scroll: false });
    });
  }

  function closeAccount() {
    startTransition(() => {
      router.push(view === "overview" ? "/admin" : `/admin?view=${view}`, { scroll: false });
    });
  }

  const hint = SEARCH_HINTS[view];

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar glass">
        <div className="admin-brand">
          <BrandMark />
          <div>
            <strong>{APP_NAME}</strong>
            <span className="eyebrow">Admin</span>
          </div>
        </div>
        <nav className="admin-nav" aria-label="Admin sections">
          {NAV.map((item) => (
            <button
              key={item.view}
              type="button"
              className={item.view === view ? "is-active" : ""}
              aria-current={item.view === view ? "page" : undefined}
              onClick={() => show(item.view)}
              title={item.label}
            >
              {item.icon}
              <span className="admin-nav-label">{item.label}</span>
              {counts[item.view] !== undefined ? (
                <span className="admin-nav-count">{counts[item.view]}</span>
              ) : null}
            </button>
          ))}
        </nav>
        <div className="admin-sidebar-foot">
          <Link href="/" className="admin-back" title="Back to the app">
            <BackIcon />
            <span className="admin-nav-label">Back to app</span>
          </Link>
        </div>
      </aside>

      <div className="admin-main">
        <header className="admin-topbar">
          <div>
            <span className="eyebrow">Read only</span>
            <h1 className="display">{TITLES[view]}</h1>
          </div>
          <div className="admin-topbar-tools">
            {hint ? (
              <label className="admin-search">
                <SearchIcon />
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={hint}
                  aria-label={hint}
                />
              </label>
            ) : null}
            <button
              type="button"
              className="admin-refresh"
              onClick={() => startTransition(() => router.refresh())}
              disabled={pending}
              title="Load the latest data"
            >
              <RefreshIcon spinning={pending} />
              <span>Updated {formatDateTime(now)}</span>
            </button>
            <ThemeToggle />
          </div>
        </header>

        <main className="admin-content">
          {view === "overview" ? (
            <OverviewView data={data} now={now} onOpen={openAccount} onShow={show} />
          ) : null}
          {view === "users" ? (
            <UsersView accounts={data.accounts} query={query} now={now} onOpen={openAccount} />
          ) : null}
          {view === "guests" ? (
            <GuestsView data={data} query={query} now={now} onOpen={openAccount} />
          ) : null}
          {view === "games" ? (
            <GamesView games={data.games} query={query} total={data.overview.games.total} onOpen={openAccount} />
          ) : null}
          {view === "system" ? <SystemView data={data} now={now} onOpen={openAccount} /> : null}
        </main>
      </div>

      {detailId ? (
        <AccountDrawer
          key={detailId}
          detail={data.detail?.account.id === detailId ? data.detail : null}
          loading={pending}
          now={now}
          onClose={closeAccount}
          onOpen={openAccount}
        />
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Overview                                                           */
/* ------------------------------------------------------------------ */

function OverviewView({
  data,
  now,
  onOpen,
  onShow,
}: {
  data: AdminData;
  now: number;
  onOpen: (id: string) => void;
  onShow: (view: AdminView) => void;
}) {
  const { overview } = data;
  const hosts = data.accounts.filter((account) => account.gamesHosted > 0);
  const topHosts = sortRows(hosts, (account) => account.gamesHosted, "desc").slice(0, 5);
  const avgMinutes = overview.games.total ? overview.games.minutes / overview.games.total : 0;

  return (
    <div className="admin-stack">
      <section className="admin-kpis" aria-label="Key numbers">
        <Kpi
          label="Signed-up users"
          value={overview.accounts.total}
          note={`${overview.accounts.new7d} new this week · ${overview.accounts.new30d} in 30 days`}
          accent
        />
        <Kpi
          label="Signed in this week"
          value={overview.signedIn7d}
          note={`${percent(overview.signedIn7d, overview.accounts.total)} of users`}
        />
        <Kpi
          label="Guests"
          value={overview.players.guests}
          note={`${overview.players.friends} linked friends · ${overview.players.own} own players`}
        />
        <Kpi
          label="Games played"
          value={overview.games.total}
          note={`${overview.games.last7d} this week · ${overview.games.last30d} in 30 days`}
          accent
        />
        <Kpi
          label="Hands dealt"
          value={overview.games.hands}
          note={`${overview.games.total ? Math.round(overview.games.hands / overview.games.total) : 0} per game`}
        />
        <Kpi
          label="Time at the table"
          value={tableTime(overview.games.minutes)}
          note={`${formatDuration(avgMinutes * 60_000)} per game`}
        />
        <Kpi
          label="Active hosts"
          value={overview.activeHosts30d}
          note={`Hosted in 30 days · ${hosts.length} ever`}
        />
        <Kpi
          label="Friendships"
          value={overview.friendships}
          note={`${overview.pendingRequests} pending requests · ${overview.liveNow} live links`}
        />
      </section>

      <section className="admin-grid-2">
        <WeeklyChart
          title="Sign-ups per week"
          weeks={overview.weeks}
          value={(week) => week.signups}
          tone="g"
        />
        <WeeklyChart
          title="Games per week"
          weeks={overview.weeks}
          value={(week) => week.games}
          tone="b"
        />
      </section>

      <section className="admin-grid-3">
        <Panel title="Newest users" action={<TextButton onClick={() => onShow("users")}>All users</TextButton>}>
          <ul className="admin-list">
            {data.accounts.slice(0, 6).map((account) => (
              <li key={account.id}>
                <button type="button" className="admin-list-row" onClick={() => onOpen(account.id)}>
                  <AvatarArt id={account.avatar} seed={account.id} size={34} />
                  <span className="admin-list-main">
                    <strong>{accountLabel(account)}</strong>
                    <span className="literal-text muted">{account.email}</span>
                  </span>
                  <span className="admin-list-side muted">{relativeTime(account.joinedAt, now)}</span>
                </button>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title="Top hosts" action={<span className="muted small-note">By games hosted</span>}>
          {topHosts.length ? (
            <ul className="admin-list">
              {topHosts.map((account) => (
                <li key={account.id}>
                  <button type="button" className="admin-list-row" onClick={() => onOpen(account.id)}>
                    <AvatarArt id={account.avatar} seed={account.id} size={34} />
                    <span className="admin-list-main">
                      <strong>{accountLabel(account)}</strong>
                      <span className="muted">
                        {account.guests} guests · {account.friends} friends
                      </span>
                    </span>
                    <span className="admin-list-side">
                      <strong>{account.gamesHosted}</strong>
                      <span className="muted"> games</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>No games yet</Empty>
          )}
        </Panel>
        <Panel title="Latest games" action={<TextButton onClick={() => onShow("games")}>All games</TextButton>}>
          {data.games.length ? (
            <ul className="admin-list">
              {data.games.slice(0, 6).map((game) => {
                const winner = game.results[0];
                return (
                  <li key={game.recordId}>
                    <button type="button" className="admin-list-row" onClick={() => onOpen(game.hostId)}>
                      <AvatarArt id={game.hostAvatar} seed={game.hostId} size={34} />
                      <span className="admin-list-main">
                        <strong>{game.name ?? `Game ${game.number ?? ""}`.trim()}</strong>
                        <span className="muted">
                          {game.hostName} · {game.results.length} players · {game.hands} hands
                        </span>
                      </span>
                      <span className="admin-list-side">
                        {winner ? (
                          <span className="pos">{formatSignedMoney(winner.net, game.currency)}</span>
                        ) : null}
                        <span className="muted admin-list-time">{relativeTime(game.playedAt, now)}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <Empty>No games yet</Empty>
          )}
        </Panel>
      </section>
    </div>
  );
}

/** "45h 10m", or whole hours once it passes 100 hours. */
function tableTime(minutes: number) {
  return minutes >= 6000
    ? `${Math.round(minutes / 60).toLocaleString("en-IN")}h`
    : formatDuration(minutes * 60_000);
}

function percent(part: number, whole: number) {
  return whole ? `${Math.round((part / whole) * 100)}%` : "0%";
}

function Kpi({
  label,
  value,
  note,
  accent = false,
}: {
  label: string;
  value: number | string;
  note: string;
  accent?: boolean;
}) {
  return (
    <div className="admin-kpi glass">
      <span className="label">{label}</span>
      <strong className={`admin-kpi-value display ${accent ? "gradient-text" : ""}`}>
        {typeof value === "number" ? value.toLocaleString("en-IN") : value}
      </strong>
      <span className="admin-kpi-note muted">{note}</span>
    </div>
  );
}

/** Bars for the last 12 weeks, one series, with a hover tooltip per week. */
function WeeklyChart({
  title,
  weeks,
  value,
  tone,
}: {
  title: string;
  weeks: AdminWeek[];
  value: (week: AdminWeek) => number;
  tone: "g" | "b";
}) {
  const [hover, setHover] = useState<number | null>(null);
  const values = weeks.map(value);
  const max = Math.max(1, ...values);
  const total = values.reduce((sum, item) => sum + item, 0);
  const width = 600;
  const height = 180;
  const top = 12;
  const bottom = 26;
  const plot = height - top - bottom;
  const slot = width / Math.max(1, weeks.length);
  const bar = Math.min(34, slot - 8);
  const ticks = niceTicks(max);
  const hovered = hover === null ? null : weeks[hover];

  return (
    <Panel
      title={title}
      action={
        <span className="muted small-note">
          {total} in 12 weeks
        </span>
      }
    >
      <div className="admin-chart">
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${title}: ${values.join(", ")}`}>
          {ticks.map((tick) => {
            const y = top + plot - (tick / ticks[ticks.length - 1]) * plot;
            return (
              <g key={tick}>
                <line x1={0} x2={width} y1={y} y2={y} className="admin-chart-grid" />
                <text x={2} y={y - 4} className="admin-chart-tick">
                  {tick}
                </text>
              </g>
            );
          })}
          {weeks.map((week, index) => {
            const amount = values[index];
            const scaleMax = ticks[ticks.length - 1];
            const barHeight = amount ? Math.max(3, (amount / scaleMax) * plot) : 0;
            const x = index * slot + (slot - bar) / 2;
            const y = top + plot - barHeight;
            const radius = Math.min(4, barHeight / 2);
            return (
              <g
                key={week.start}
                onMouseEnter={() => setHover(index)}
                onMouseLeave={() => setHover(null)}
              >
                <rect x={index * slot} y={0} width={slot} height={height} fill="transparent" />
                {barHeight ? (
                  <path
                    className={`admin-chart-bar tone-${tone} ${hover === index ? "is-hover" : ""}`}
                    d={`M${x},${top + plot} V${y + radius} Q${x},${y} ${x + radius},${y} H${x + bar - radius} Q${x + bar},${y} ${x + bar},${y + radius} V${top + plot} Z`}
                  />
                ) : null}
                {(weeks.length - 1 - index) % 2 === 0 ? (
                  <text x={index * slot + slot / 2} y={height - 6} className="admin-chart-axis">
                    {shortWeek(week.start)}
                  </text>
                ) : null}
              </g>
            );
          })}
          <line x1={0} x2={width} y1={top + plot} y2={top + plot} className="admin-chart-base" />
        </svg>
        {hovered && hover !== null ? (
          <div
            className="admin-chart-tip glass"
            style={{ left: `${((hover + 0.5) / weeks.length) * 100}%` }}
          >
            <span className="muted">Week of {shortWeek(hovered.start)}</span>
            <strong>{values[hover]}</strong>
          </div>
        ) : null}
      </div>
    </Panel>
  );
}

function niceTicks(max: number) {
  const step = max <= 4 ? 1 : max <= 10 ? 2 : Math.ceil(max / 4 / 5) * 5;
  const ticks = [];
  for (let tick = step; tick < max + step; tick += step) ticks.push(tick);
  return ticks.length ? ticks : [1];
}

function shortWeek(time: number) {
  return new Date(time).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

/* ------------------------------------------------------------------ */
/* Users                                                              */
/* ------------------------------------------------------------------ */

type UserFilter = "all" | "hosts" | "unnamed" | "deleting";

const USER_FILTERS: Array<{ id: UserFilter; label: string; test: (account: AdminAccount) => boolean }> = [
  { id: "all", label: "All", test: () => true },
  { id: "hosts", label: "Hosts", test: (account) => account.gamesHosted > 0 },
  { id: "unnamed", label: "No name yet", test: (account) => !account.displayName },
  { id: "deleting", label: "Deleting", test: (account) => account.state !== "active" },
];

type UserColumn = {
  id: string;
  label: string;
  value: (account: AdminAccount) => string | number | boolean | null;
  numeric?: boolean;
};

const USER_COLUMNS: UserColumn[] = [
  { id: "name", label: "User", value: (account) => accountLabel(account) },
  { id: "code", label: "Code", value: (account) => account.userCode },
  { id: "joined", label: "Joined", value: (account) => account.joinedAt },
  { id: "seen", label: "Last sign-in", value: (account) => account.lastSignInAt },
  { id: "hosted", label: "Hosted", value: (account) => account.gamesHosted, numeric: true },
  { id: "played", label: "Played", value: (account) => account.gamesPlayedAsFriend, numeric: true },
  { id: "lastGame", label: "Last game", value: (account) => account.lastGameAt },
  { id: "guests", label: "Guests", value: (account) => account.guests, numeric: true },
  { id: "friends", label: "Friends", value: (account) => account.friends, numeric: true },
  { id: "state", label: "Status", value: (account) => account.state },
];

function UsersView({
  accounts,
  query,
  now,
  onOpen,
}: {
  accounts: AdminAccount[];
  query: string;
  now: number;
  onOpen: (id: string) => void;
}) {
  const [filter, setFilter] = useState<UserFilter>("all");
  const [sort, setSort] = useSortState("joined", "desc");

  const rows = useMemo(() => {
    const test = USER_FILTERS.find((item) => item.id === filter)?.test ?? (() => true);
    const column = USER_COLUMNS.find((item) => item.id === sort.column) ?? USER_COLUMNS[2];
    return sortRows(
      accounts.filter(
        (account) =>
          test(account) &&
          matchesQuery(query, [account.displayName, account.authName, account.email, account.userCode]),
      ),
      column.value,
      sort.direction,
    );
  }, [accounts, filter, query, sort]);

  return (
    <Panel
      title={`${rows.length} of ${accounts.length} users`}
      action={
        <Chips
          options={USER_FILTERS.map((item) => ({
            id: item.id,
            label: item.label,
            count: accounts.filter(item.test).length,
          }))}
          value={filter}
          onChange={setFilter}
        />
      }
      flush
    >
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              {USER_COLUMNS.map((column) => (
                <SortHeader key={column.id} column={column} sort={sort} onSort={setSort} />
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((account) => (
              <tr key={account.id} className="is-clickable" onClick={() => onOpen(account.id)}>
                <td>
                  <span className="admin-person">
                    <AvatarArt id={account.avatar} seed={account.id} size={32} />
                    <span>
                      <button
                        type="button"
                        className="admin-person-name"
                        onClick={(event) => {
                          event.stopPropagation();
                          onOpen(account.id);
                        }}
                      >
                        {accountLabel(account)}
                        {account.isAdmin ? <span className="admin-badge tone-b">Admin</span> : null}
                      </button>
                      <span className="literal-text muted admin-person-sub">
                        {account.email}
                        {account.email && !account.emailVerified ? " · unverified" : ""}
                      </span>
                    </span>
                  </span>
                </td>
                <td className="literal-text mono">{account.userCode ?? "—"}</td>
                <td title={formatDateTime(account.joinedAt)}>{formatDate(account.joinedAt)}</td>
                <td title={formatDateTime(account.lastSignInAt)}>{relativeTime(account.lastSignInAt, now)}</td>
                <td className="num">{account.gamesHosted}</td>
                <td className="num">{account.gamesPlayedAsFriend}</td>
                <td title={formatDateTime(account.lastGameAt)}>{relativeTime(account.lastGameAt, now)}</td>
                <td className="num">{account.guests}</td>
                <td className="num">{account.friends}</td>
                <td>
                  <StateBadge account={account} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length ? null : <Empty>No users match</Empty>}
      </div>
    </Panel>
  );
}

function StateBadge({ account }: { account: Pick<AdminAccount, "state" | "displayName"> }) {
  if (account.state === "purging") return <span className="admin-badge tone-neg">Purging</span>;
  if (account.state === "deletion_requested") return <span className="admin-badge tone-neg">Deleting</span>;
  if (!account.displayName) return <span className="admin-badge">No name</span>;
  return <span className="admin-badge tone-g">Active</span>;
}

/* ------------------------------------------------------------------ */
/* Guests                                                             */
/* ------------------------------------------------------------------ */

const GUEST_COLUMNS: Array<{
  id: string;
  label: string;
  value: (guest: AdminGuest) => string | number | null;
  numeric?: boolean;
}> = [
  { id: "name", label: "Guest", value: (guest) => guest.name },
  { id: "code", label: "Code", value: (guest) => guest.code },
  { id: "host", label: "Added by", value: (guest) => guest.hostName },
  { id: "added", label: "Added", value: (guest) => guest.addedAt },
  { id: "games", label: "Games", value: (guest) => guest.games, numeric: true },
  { id: "net", label: "Net", value: (guest) => guest.net, numeric: true },
  { id: "last", label: "Last played", value: (guest) => guest.lastPlayedAt },
];

function GuestsView({
  data,
  query,
  now,
  onOpen,
}: {
  data: AdminData;
  query: string;
  now: number;
  onOpen: (id: string) => void;
}) {
  const [host, setHost] = useState("all");
  const [showRemoved, setShowRemoved] = useState(false);
  const [sort, setSort] = useSortState("games", "desc");
  const hosts = useMemo(() => {
    const seen = new Map<string, string>();
    for (const guest of data.guests) seen.set(guest.hostId, guest.hostName ?? guest.hostEmail ?? "Unnamed");
    return [...seen].sort((a, b) => a[1].localeCompare(b[1]));
  }, [data.guests]);


  const rows = useMemo(() => {
    const column = GUEST_COLUMNS.find((item) => item.id === sort.column) ?? GUEST_COLUMNS[4];
    return sortRows(
      data.guests.filter(
        (guest) =>
          (showRemoved || !guest.removed) &&
          (host === "all" || guest.hostId === host) &&
          matchesQuery(query, [guest.name, guest.code, guest.hostName, guest.hostEmail]),
      ),
      column.value,
      sort.direction,
    );
  }, [data.guests, host, query, showRemoved, sort]);

  const played = rows.filter((guest) => guest.games > 0).length;

  return (
    <div className="admin-stack">
      <section className="admin-kpis admin-kpis-3">
        <Kpi label="Guests shown" value={rows.length} note={`${played} have played a game`} accent />
        <Kpi label="Hosts with guests" value={hosts.length} note="Each guest belongs to one host's ledger" />
        <Kpi
          label="Linked to an account"
          value={data.overview.players.friends}
          note="Guests who became friends are counted under Users"
        />
      </section>
      <Panel
        title="Every guest"
        action={
          <div className="admin-filters">
            <select value={host} onChange={(event) => setHost(event.target.value)} aria-label="Filter by host">
              <option value="all">All hosts</option>
              {hosts.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
            <label className="admin-check">
              <input type="checkbox" checked={showRemoved} onChange={(event) => setShowRemoved(event.target.checked)} />
              Show removed
            </label>
          </div>
        }
        flush
      >
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                {GUEST_COLUMNS.map((column) => (
                  <SortHeader key={column.id} column={column} sort={sort} onSort={setSort} />
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((guest) => (
                <tr key={guest.id} className={guest.removed ? "is-removed" : ""}>
                  <td>
                    <span className="admin-person">
                      <AvatarArt id={guest.avatar} seed={guest.id} size={30} />
                      <span>
                        <strong className="literal-text">{guest.name}</strong>
                        {guest.removed ? <span className="admin-badge">Removed</span> : null}
                      </span>
                    </span>
                  </td>
                  <td className="literal-text mono">{guest.code ?? "—"}</td>
                  <td>
                    <button type="button" className="admin-link" onClick={() => onOpen(guest.hostId)}>
                      {guest.hostName ?? guest.hostEmail}
                    </button>
                  </td>
                  <td>{formatDate(guest.addedAt)}</td>
                  <td className="num">{guest.games}</td>
                  <td className={`num ${guest.net > 0 ? "pos" : guest.net < 0 ? "neg" : ""}`}>
                    {formatSignedMoney(guest.net, guest.currency)}
                  </td>
                  <td title={formatDateTime(guest.lastPlayedAt)}>{relativeTime(guest.lastPlayedAt, now)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length ? null : <Empty>No guests match</Empty>}
        </div>
      </Panel>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Games                                                              */
/* ------------------------------------------------------------------ */

function GamesView({
  games,
  query,
  total,
  onOpen,
}: {
  games: AdminGame[];
  query: string;
  total: number;
  onOpen: (id: string) => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const rows = games.filter((game) =>
    matchesQuery(query, [game.name, game.hostName, ...game.results.map((result) => result.name)]),
  );

  return (
    <Panel
      title={`${rows.length} games`}
      action={
        <span className="muted small-note">
          {games.length < total ? `Latest ${games.length} of ${total}` : "Newest first"} · click a game for results
        </span>
      }
      flush
    >
      <GameTable games={rows} open={open} onToggle={setOpen} onOpen={onOpen} showHost />
    </Panel>
  );
}

function GameTable({
  games,
  open,
  onToggle,
  onOpen,
  showHost,
}: {
  games: AdminGame[];
  open: string | null;
  onToggle: (id: string | null) => void;
  onOpen?: (id: string) => void;
  showHost: boolean;
}) {
  return (
    <div className="admin-table-wrap">
      <table className="admin-table">
        <thead>
          <tr>
            <th>Game</th>
            {showHost ? <th>Host</th> : null}
            <th>Played</th>
            <th>Length</th>
            <th className="num">Players</th>
            <th className="num">Hands</th>
            <th className="num">Blinds</th>
            <th className="num">Pot won</th>
            <th>Winner</th>
          </tr>
        </thead>
        <tbody>
          {games.map((game) => {
            const isOpen = open === game.recordId;
            const winner = game.results[0];
            return (
              <Fragment key={game.recordId}>
                <tr
                  className={`is-clickable ${isOpen ? "is-open" : ""}`}
                  onClick={() => onToggle(isOpen ? null : game.recordId)}
                >
                  <td>
                    <button
                      type="button"
                      className="admin-game-name"
                      aria-expanded={isOpen}
                      onClick={(event) => {
                        event.stopPropagation();
                        onToggle(isOpen ? null : game.recordId);
                      }}
                    >
                      <Chevron open={isOpen} />
                      <span>
                        <strong>{game.name ?? "Untitled game"}</strong>
                        <span className="muted admin-person-sub">#{game.number ?? "—"}</span>
                      </span>
                    </button>
                  </td>
                  {showHost ? (
                    <td>
                      <button
                        type="button"
                        className="admin-link"
                        onClick={(event) => {
                          event.stopPropagation();
                          onOpen?.(game.hostId);
                        }}
                      >
                        {game.hostName ?? "Unnamed"}
                      </button>
                    </td>
                  ) : null}
                  <td>{formatDateTime(game.playedAt)}</td>
                  <td>{formatDuration(game.endedAt - game.playedAt)}</td>
                  <td className="num">{game.results.length}</td>
                  <td className="num">{game.hands}</td>
                  <td className="num">{formatMoney(game.bigBlind, game.currency)}</td>
                  <td className="num">{formatMoney(gamePot(game), game.currency)}</td>
                  <td>
                    {winner ? (
                      <span className="admin-person">
                        <AvatarArt id={winner.avatar} seed={winner.playerId} size={24} />
                        <span className="literal-text">{winner.name}</span>
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
                {isOpen ? (
                  <tr className="admin-results-row">
                    <td colSpan={showHost ? 9 : 8}>
                      <div className="admin-results">
                        {game.results.map((result) => (
                          <div key={result.playerId} className="admin-result">
                            <AvatarArt id={result.avatar} seed={result.playerId} size={30} />
                            <span className="admin-list-main">
                              <strong className="literal-text">{result.name}</strong>
                              <span className="muted">
                                <KindLabel kind={result.kind} /> · in {formatMoney(result.invested, game.currency)}
                                {result.rebuys ? ` (${result.rebuys} rebuy${result.rebuys > 1 ? "s" : ""})` : ""} · out{" "}
                                {formatMoney(result.endingStack, game.currency)}
                              </span>
                            </span>
                            <strong className={result.net > 0 ? "pos" : result.net < 0 ? "neg" : "muted"}>
                              {formatSignedMoney(result.net, game.currency)}
                            </strong>
                          </div>
                        ))}
                      </div>
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
      {games.length ? null : <Empty>No games</Empty>}
    </div>
  );
}

function KindLabel({ kind }: { kind: PlayerKind }) {
  return <>{kind === "own" ? "Host" : kind === "friend" ? "Friend" : "Guest"}</>;
}

/* ------------------------------------------------------------------ */
/* System                                                             */
/* ------------------------------------------------------------------ */

function SystemView({ data, now, onOpen }: { data: AdminData; now: number; onOpen: (id: string) => void }) {
  const { system } = data;
  const openPurges = system.purges.filter((purge) => purge.completedAt === null);
  const names = new Map(data.accounts.map((account) => [account.id, accountLabel(account)]));

  return (
    <div className="admin-stack">
      <section className="admin-kpis">
        <Kpi label="Migrations applied" value={system.migrations.length} note={`Latest ${system.migrations[0]?.version ?? "—"}`} />
        <Kpi label="Awaiting deletion" value={system.pendingDeletions.length} note="Deleted 30 days after the request" />
        <Kpi
          label="Unfinished purges"
          value={openPurges.length}
          note={openPurges.some((purge) => purge.lastError) ? "Some have errors" : "Daily job is clear"}
        />
        <Kpi label="Live links now" value={data.overview.liveNow} note="Standings links shared in the last 12 hours" />
      </section>

      <section className="admin-grid-2">
        <Panel title="Accounts awaiting deletion">
          {system.pendingDeletions.length ? (
            <ul className="admin-list">
              {system.pendingDeletions.map((item) => (
                <li key={item.accountId}>
                  <button type="button" className="admin-list-row" onClick={() => onOpen(item.accountId)}>
                    <span className="admin-list-main">
                      <strong>{item.name ?? item.email ?? "Unnamed"}</strong>
                      <span className="literal-text muted">{item.email}</span>
                    </span>
                    <span className="admin-list-side">
                      <span className="neg">Deletes {formatDate(item.deadline)}</span>
                      <span className="muted admin-list-time">Asked {relativeTime(item.requestedAt, now)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>No one has asked to delete their account</Empty>
          )}
        </Panel>
        <Panel title="Purge job">
          {system.purges.length ? (
            <ul className="admin-list">
              {system.purges.map((purge) => (
                <li key={purge.accountId} className="admin-list-row is-static">
                  <span className="admin-list-main">
                    <strong className="literal-text mono">{purge.accountId.slice(0, 8)}</strong>
                    <span className="muted">
                      {purge.attempts} attempt{purge.attempts === 1 ? "" : "s"}
                      {purge.lastError ? ` · ${purge.lastError}` : ""}
                    </span>
                  </span>
                  <span className="admin-list-side">
                    {purge.completedAt ? (
                      <span className="admin-badge tone-g">Done {formatDate(purge.completedAt)}</span>
                    ) : (
                      <span className="admin-badge tone-neg">Open</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>No accounts have been purged</Empty>
          )}
        </Panel>
      </section>

      <section className="admin-grid-2">
        <Panel title="Recent activity" action={<span className="muted small-note">Audit log, newest first</span>}>
          <ul className="admin-list admin-audit">
            {system.audit.map((event, index) => (
              <li key={`${event.at}-${index}`} className="admin-list-row is-static">
                <span className="admin-list-main">
                  <strong className="literal-text mono">{event.action}</strong>
                  <span className="muted">
                    <button type="button" className="admin-link" onClick={() => onOpen(event.ownerId)}>
                      {event.ownerName ?? names.get(event.ownerId) ?? "Unnamed"}
                    </button>{" "}
                    · {event.targetKind.replace(/_/g, " ")}
                  </span>
                </span>
                <span className="admin-list-side muted" title={formatDateTime(event.at)}>
                  {relativeTime(event.at, now)}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title="Database migrations">
          <ul className="admin-list">
            {system.migrations.map((migration) => (
              <li key={migration.version} className="admin-list-row is-static">
                <span className="admin-list-main">
                  <strong className="literal-text mono">{migration.version}</strong>
                </span>
                <span className="admin-list-side muted">{formatDate(migration.appliedAt)}</span>
              </li>
            ))}
          </ul>
        </Panel>
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* One person                                                         */
/* ------------------------------------------------------------------ */

function AccountDrawer({
  detail,
  loading,
  now,
  onClose,
  onOpen,
}: {
  detail: AdminData["detail"];
  loading: boolean;
  now: number;
  onClose: () => void;
  onOpen: (id: string) => void;
}) {
  const [openGame, setOpenGame] = useState<string | null>(null);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const account = detail?.account;

  return (
    <div className="admin-drawer-layer">
      <button type="button" className="admin-drawer-scrim" aria-label="Close" onClick={onClose} />
      <aside className="admin-drawer glass" aria-label="User detail" aria-busy={loading}>
        <header className="admin-drawer-head">
          {account ? (
            <>
              <AvatarArt id={account.avatar} seed={account.id} size={56} />
              <div className="admin-drawer-title">
                <h2 className="display">{accountLabel(account)}</h2>
                <span className="literal-text muted">{account.email}</span>
                <span className="admin-badges">
                  <StateBadge account={account} />
                  {account.isAdmin ? <span className="admin-badge tone-b">Admin</span> : null}
                  <span className="admin-badge literal-text mono">{account.userCode}</span>
                  <span className="admin-badge">{account.currency}</span>
                </span>
              </div>
            </>
          ) : (
            <div className="admin-drawer-title">
              <h2 className="display">{loading ? "Loading…" : "User not found"}</h2>
            </div>
          )}
          <button type="button" className="round-button admin-drawer-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        {account && detail ? (
          <div className={`admin-drawer-body ${loading ? "is-loading" : ""}`}>
            <div className="admin-mini-stats">
              <MiniStat label="Joined" value={formatDate(account.joinedAt)} />
              <MiniStat label="Last sign-in" value={relativeTime(account.lastSignInAt, now)} />
              <MiniStat label="Games hosted" value={account.gamesHosted} />
              <MiniStat label="Played as friend" value={account.gamesPlayedAsFriend} />
              <MiniStat label="Hands hosted" value={account.handsPlayed.toLocaleString("en-IN")} />
              <MiniStat label="Friends" value={account.friends} />
            </div>
            {account.deletionRequestedAt ? (
              <p className="admin-warning">
                Asked to delete this account on {formatDate(account.deletionRequestedAt)}; it is removed for good
                30 days later.
              </p>
            ) : null}

            <DrawerSection title={`Players in their ledger (${detail.players.length})`}>
              {detail.players.length ? (
                <ul className="admin-list">
                  {detail.players.map((player) => (
                    <li key={player.id} className={`admin-list-row is-static ${player.removed ? "is-removed" : ""}`}>
                      <AvatarArt id={player.avatar} seed={player.id} size={30} />
                      <span className="admin-list-main">
                        <strong className="literal-text">
                          {player.name}
                          {player.removed ? <span className="admin-badge">Removed</span> : null}
                        </strong>
                        <span className="muted">
                          {player.kind === "friend" && player.linkedAccountId ? (
                            <button type="button" className="admin-link" onClick={() => onOpen(player.linkedAccountId!)}>
                              Friend
                            </button>
                          ) : (
                            <KindLabel kind={player.kind} />
                          )}{" "}
                          · {player.games} games · {relativeTime(player.lastPlayedAt, now)}
                        </span>
                      </span>
                      <strong className={`admin-list-side ${player.net > 0 ? "pos" : player.net < 0 ? "neg" : "muted"}`}>
                        {formatSignedMoney(player.net, account.currency)}
                      </strong>
                    </li>
                  ))}
                </ul>
              ) : (
                <Empty>No players yet</Empty>
              )}
            </DrawerSection>

            <DrawerSection title={`Latest games hosted (${detail.games.length})`}>
              {detail.games.length ? (
                <GameTable games={detail.games} open={openGame} onToggle={setOpenGame} showHost={false} />
              ) : (
                <Empty>Hasn&apos;t hosted a game</Empty>
              )}
            </DrawerSection>

            <div className="admin-grid-2 admin-drawer-pair">
              <DrawerSection title={`Friends (${detail.friends.length})`}>
                {detail.friends.length ? (
                  <ul className="admin-list">
                    {detail.friends.map((friend) => (
                      <li key={friend.accountId}>
                        <button type="button" className="admin-list-row" onClick={() => onOpen(friend.accountId)}>
                          <AvatarArt id={friend.avatar} seed={friend.accountId} size={28} />
                          <span className="admin-list-main">
                            <strong>{friend.name ?? "Unnamed"}</strong>
                            <span className="muted">Since {formatDate(friend.since)}</span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <Empty>No friends yet</Empty>
                )}
              </DrawerSection>
              <DrawerSection title={`Pending requests (${detail.requests.length})`}>
                {detail.requests.length ? (
                  <ul className="admin-list">
                    {detail.requests.map((request, index) => (
                      <li key={index} className="admin-list-row is-static">
                        <span className="admin-list-main">
                          <strong>{request.otherName ?? "Unnamed"}</strong>
                          <span className="muted">
                            {request.direction === "sent" ? "Sent" : "Received"} {relativeTime(request.createdAt, now)}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <Empty>None</Empty>
                )}
              </DrawerSection>
            </div>
            <p className="muted small-note admin-drawer-note">Opening this page is recorded in your audit log.</p>
          </div>
        ) : null}
      </aside>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="admin-mini-stat">
      <span className="label">{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function DrawerSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="admin-drawer-section">
      <h3 className="label">{title}</h3>
      {children}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Shared pieces                                                      */
/* ------------------------------------------------------------------ */

function Panel({
  title,
  action,
  children,
  flush = false,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  flush?: boolean;
}) {
  return (
    <section className={`admin-panel glass ${flush ? "is-flush" : ""}`}>
      <header className="admin-panel-head">
        <h2 className="card-title">{title}</h2>
        {action}
      </header>
      {children}
    </section>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="admin-empty muted">{children}</p>;
}

function TextButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button type="button" className="admin-text-button" onClick={onClick}>
      {children} →
    </button>
  );
}

function Chips<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Array<{ id: T; label: string; count: number }>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="admin-chips" role="group">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          className={option.id === value ? "is-active" : ""}
          aria-pressed={option.id === value}
          onClick={() => onChange(option.id)}
        >
          {option.label} <span className="muted">{option.count}</span>
        </button>
      ))}
    </div>
  );
}

type SortState = { column: string; direction: SortDirection };

function useSortState(column: string, direction: SortDirection) {
  return useState<SortState>({ column, direction });
}

function SortHeader({
  column,
  sort,
  onSort,
}: {
  column: { id: string; label: string; numeric?: boolean };
  sort: SortState;
  onSort: (sort: SortState) => void;
}) {
  const active = sort.column === column.id;
  return (
    <th
      className={column.numeric ? "num" : ""}
      aria-sort={active ? (sort.direction === "asc" ? "ascending" : "descending") : undefined}
    >
      <button
        type="button"
        className={`admin-sort ${active ? "is-active" : ""}`}
        onClick={() =>
          onSort({
            column: column.id,
            direction: active && sort.direction === "desc" ? "asc" : "desc",
          })
        }
      >
        {column.label}
        <span aria-hidden="true">{active ? (sort.direction === "asc" ? "▲" : "▼") : "↕"}</span>
      </button>
    </th>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true" className={`admin-chevron ${open ? "is-open" : ""}`}>
      <path d="M4 2.5l4 3.5-4 3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}

function GridIcon() {
  return (
    <Icon>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
    </Icon>
  );
}

function UsersIcon() {
  return (
    <Icon>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5" />
      <path d="M15.5 4.8a3.3 3.3 0 0 1 0 6.4M18 14.8c2 .6 3.2 2.3 3.5 5.2" />
    </Icon>
  );
}

function GuestIcon() {
  return (
    <Icon>
      <circle cx="12" cy="8" r="3.8" />
      <path d="M4.5 20.5c.7-4 3.6-6 7.5-6s6.8 2 7.5 6" />
      <path d="M17.5 3.5h3v3" />
    </Icon>
  );
}

function CardsIcon() {
  return (
    <Icon>
      <rect x="3" y="5" width="11" height="15" rx="2" />
      <path d="M17 4.5l3.4 1a1.6 1.6 0 0 1 1.1 2l-3.3 11.7" />
      <path d="M8.5 10l1.8 2.4-1.8 2.4-1.8-2.4z" />
    </Icon>
  );
}

function ServerIcon() {
  return (
    <Icon>
      <ellipse cx="12" cy="5.5" rx="7.5" ry="2.5" />
      <path d="M4.5 5.5v13c0 1.4 3.4 2.5 7.5 2.5s7.5-1.1 7.5-2.5v-13" />
      <path d="M4.5 12c0 1.4 3.4 2.5 7.5 2.5s7.5-1.1 7.5-2.5" />
    </Icon>
  );
}

function BackIcon() {
  return (
    <Icon>
      <path d="M14.5 5.5L8 12l6.5 6.5" />
    </Icon>
  );
}

function SearchIcon() {
  return (
    <Icon>
      <circle cx="11" cy="11" r="6" />
      <path d="M20 20l-4.5-4.5" />
    </Icon>
  );
}

function RefreshIcon({ spinning }: { spinning: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      className={spinning ? "admin-spin" : ""}
    >
      <path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" />
      <path d="M19.5 4.5v3.8h-3.8" />
    </svg>
  );
}
