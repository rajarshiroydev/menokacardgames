"use client";

import {
  FormEvent,
  ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { AvatarArt } from "@/components/avatar-art";
import { accountApi, friendsApi } from "@/components/ledger/api";
import { toneClass } from "@/components/ledger/avatar";
import type { AskOptions } from "@/components/ledger/modal";
import { useMoney } from "@/components/ledger/money";
import {
  AddPlayerSheet,
  AvatarSheet,
  FriendRequestCard,
  LinkFriendSheet,
  RenameSheet,
} from "@/components/ledger/profile-sheets";
import { InviteSheet, QR_ICON, UserCodeSheet } from "@/components/ledger/share-sheets";
import { PokerizeBadge } from "@/components/pokerize-badge";
import {
  type AccountProfile,
  cleanDisplayName,
  formatUserCode,
  MAX_DISPLAY_NAME_LENGTH,
} from "@/lib/accounts/identity-code";
import { APP_NAME } from "@/lib/brand";
import { linkableFriends } from "@/lib/friends/link-guest";
import type { FriendOverview } from "@/lib/friends/requests";
import { formatDate } from "@/lib/poker/game";
import { CURRENCIES } from "@/lib/poker/money";
import { buildStandings, standingsKey } from "@/lib/poker/standings";
import type { PlayerProfile, PokerSession } from "@/lib/poker/types";
import type { ProfileSummary } from "@/lib/profile/stats";
import { apiErrorMessage } from "@/lib/security/rate-limit-message";

/** How long a press on a player opens their options. */
const LONG_PRESS_MS = 450;

type PlayerFilter = "all" | "app" | "guest";

type ProfileRow = {
  key: string;
  kind: "self" | "friend" | "guest" | "pending" | "removed";
  name: string;
  avatar?: string;
  player?: PlayerProfile;
  friend?: FriendOverview["friends"][number];
  requestId?: string;
  /** Games in your own ledger (for the merge warning when linking). */
  games: number;
  /** Games you both played in, whoever hosted; unknown until stats load. */
  together?: number;
};

type RowAction = { label: string; danger?: boolean; run: () => void };

export async function profileStatsApi() {
  const response = await fetch("/api/profile");
  const data = (await response.json().catch(() => ({}))) as {
    stats?: ProfileSummary;
    error?: string;
  };
  if (!response.ok || !data.stats) {
    throw new Error(
      apiErrorMessage(response.status, data.error, "Could not load your stats"),
    );
  }
  return data.stats;
}

const shortPercent = new Intl.NumberFormat("en-IN", {
  maximumFractionDigits: 1,
  signDisplay: "exceptZero",
});

/** "+12.4%": one decimal, to fit the profile's small tiles. */
export function formatShortPercent(value: number) {
  return `${shortPercent.format(value)}%`;
}

function monthYear(timestamp: number) {
  return new Date(timestamp).toLocaleDateString("en-IN", {
    month: "short",
    year: "numeric",
  });
}

/**
 * The Profile tab: who you are to your friends, your own record across every
 * ledger you played in, your currency, friend requests, and your players.
 */
export function ProfileView({
  profile,
  accountEmail,
  onOpenSettings,
  onSignOut,
  onProfile,
  players,
  discardedPlayers,
  history,
  loading,
  error,
  onRetry,
  onAdd,
  onRename,
  onGuestAvatar,
  onDiscard,
  onRestore,
  onDeletePermanently,
  onPlayersChanged,
  onViewStandings,
  onToast,
  onAsk,
  seatedPlayerIds,
  onGamesMoved,
  friendOverview: overview,
  friendOverviewError: overviewError,
  onReloadFriends: reloadOverview,
  stats,
  statsError,
}: {
  profile: AccountProfile;
  accountEmail: string;
  onOpenSettings: () => void;
  onSignOut: () => void;
  onProfile: (profile: AccountProfile) => void;
  players: PlayerProfile[];
  discardedPlayers: PlayerProfile[];
  history: PokerSession[];
  loading: boolean;
  error: string;
  onRetry: () => void;
  onAdd: (name: string, avatar: string) => Promise<PlayerProfile | null>;
  onRename: (player: PlayerProfile, name: string) => Promise<boolean>;
  onGuestAvatar: (player: PlayerProfile, avatar: string) => Promise<boolean>;
  onDiscard: (player: PlayerProfile) => void;
  onRestore: (player: PlayerProfile) => void;
  onDeletePermanently: (player: PlayerProfile) => void;
  onPlayersChanged: () => void;
  onViewStandings: (player: PlayerProfile) => void;
  onToast: (message: string) => void;
  onAsk: (
    message: string,
    confirmLabel: string,
    onConfirm: () => void,
    options?: AskOptions,
  ) => void;
  /** Players in the game in progress on this device. */
  seatedPlayerIds: string[];
  /** Saved games now belong to another player, so reload them. */
  onGamesMoved: () => void;
  /** Friends, requests and links, kept by the app between visits. */
  friendOverview: FriendOverview | null;
  friendOverviewError: string;
  onReloadFriends: () => void;
  /** The Profile card's stats, kept by the app between visits. */
  stats: ProfileSummary | null;
  statsError: string;
}) {
  const [filter, setFilter] = useState<PlayerFilter>("all");
  const [menu, setMenu] = useState<string | null>(null);
  /** Near the bottom of the screen, a row's options open upwards, clear of the tab bar. */
  const [menuAbove, setMenuAbove] = useState(false);
  const [showRemoved, setShowRemoved] = useState(false);
  const [adding, setAdding] = useState(false);
  // A code read with Scan Code on the profile card, looked up on opening.
  const [scannedCode, setScannedCode] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<PlayerProfile | null>(null);
  const [choosingAvatar, setChoosingAvatar] = useState<PlayerProfile | null>(null);
  const [linking, setLinking] = useState<PlayerProfile | null>(null);
  const [inviting, setInviting] = useState<PlayerProfile | null>(null);
  const [busy, setBusy] = useState("");
  useEffect(() => {
    if (menu === null) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setMenu(null);
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [menu]);

  const openMenu = (key: string, element: Element) => {
    setMenuAbove(element.getBoundingClientRect().bottom > window.innerHeight - 340);
    setMenu(key);
  };
  const standings = useMemo(() => buildStandings(history), [history]);

  async function run(key: string, action: () => Promise<void>) {
    if (busy) return;
    setBusy(key);
    try {
      await action();
    } finally {
      setBusy("");
    }
  }

  function unfriend(friend: FriendOverview["friends"][number]) {
    const name = friend.displayName ?? "this friend";
    onAsk(
      `Unfriend ${name}?`,
      "Unfriend",
      () =>
        void run(friend.accountId, async () => {
          try {
            await friendsApi({ action: "remove", accountId: friend.accountId });
            onToast("Friend Removed");
            reloadOverview();
            onPlayersChanged();
          } catch (error) {
            onToast(
              error instanceof Error ? error.message : "Could not remove the friend",
            );
          }
        }),
      {
        danger: true,
        points: [
          "You both keep every game.",
          `${name} goes back to being a guest in your list.`,
          "To link again, send a new friend request.",
        ],
      },
    );
  }

  function cancelRequest(requestId: string) {
    void run(requestId, async () => {
      try {
        await friendsApi({ action: "cancel", requestId });
        onToast("Request Cancelled");
        reloadOverview();
      } catch (error) {
        onToast(
          error instanceof Error ? error.message : "Could not cancel the request",
        );
      }
    });
  }

  const friendByPlayer = new Map(
    (overview?.friends ?? []).flatMap((friend) =>
      friend.myPlayer ? [[friend.myPlayer.id, friend] as const] : [],
    ),
  );
  const record = (player: PlayerProfile) => {
    const entry = standings.entries.find(
      (item) => item.key === standingsKey({ playerId: player.id, name: player.name }),
    );
    return {
      games: entry?.totalSessions ?? 0,
      together: stats ? (stats.gamesTogether[player.id] ?? 0) : undefined,
    };
  };
  const liveRows: ProfileRow[] = [
    ...players.map((player): ProfileRow => ({
      key: player.id,
      kind:
        player.id === profile.selfPlayerId
          ? "self"
          : player.linked
            ? "friend"
            : "guest",
      name: player.name,
      avatar: player.id === profile.selfPlayerId ? profile.avatar : player.avatar,
      player,
      friend: friendByPlayer.get(player.id),
      ...record(player),
    })),
    ...(overview?.sent ?? []).map((request): ProfileRow => ({
      key: `request:${request.requestId}`,
      kind: "pending",
      name: request.displayName ?? "Someone",
      avatar: request.avatar,
      requestId: request.requestId,
      games: 0,
    })),
  ];
  const order: Record<ProfileRow["kind"], number> = {
    self: 0,
    friend: 1,
    pending: 2,
    guest: 3,
    removed: 4,
  };
  liveRows.sort(
    (a, b) =>
      order[a.kind] - order[b.kind] ||
      (b.together ?? b.games) - (a.together ?? a.games) ||
      a.name.localeCompare(b.name),
  );
  const hasAccount = (row: ProfileRow) => row.kind !== "guest";
  const counts: Record<PlayerFilter, number> = {
    all: liveRows.length,
    app: liveRows.filter(hasAccount).length,
    guest: liveRows.filter((row) => !hasAccount(row)).length,
  };
  const removedRows: ProfileRow[] = discardedPlayers.map((player) => ({
    key: player.id,
    kind: "removed",
    name: player.name,
    avatar: player.avatar,
    player,
    ...record(player),
  }));
  const rows = [
    ...liveRows.filter(
      (row) =>
        filter === "all" || (filter === "app" ? hasAccount(row) : !hasAccount(row)),
    ),
    ...(showRemoved ? removedRows : []),
  ];

  function actionsFor(row: ProfileRow): RowAction[] {
    const player = row.player;
    const standingsAction: RowAction[] =
      player && row.games
        ? [{ label: "View standings", run: () => onViewStandings(player) }]
        : [];
    if (row.kind === "pending" && row.requestId) {
      const requestId = row.requestId;
      return [
        { label: "Cancel request", danger: true, run: () => cancelRequest(requestId) },
      ];
    }
    if (!player) return [];
    if (row.kind === "removed") {
      return [
        { label: "Restore", run: () => onRestore(player) },
        ...(player.hasHistory || player.linked
          ? []
          : [
              {
                label: "Delete permanently",
                danger: true,
                run: () => onDeletePermanently(player),
              },
            ]),
      ];
    }
    // You are always in your own list, under the name on your card.
    if (row.kind === "self") return standingsAction;
    if (row.kind === "friend") {
      const friend = row.friend;
      return [
        ...standingsAction,
        ...(friend
          ? [{ label: "Unfriend", danger: true, run: () => unfriend(friend) }]
          : []),
      ];
    }
    return [
      ...standingsAction,
      // Always offered on a guest; the sheet says when no friend is free.
      { label: "Link to friend…", run: () => setLinking(player) },
      { label: "Invite to Pokerize", run: () => setInviting(player) },
      { label: "Rename", run: () => setRenaming(player) },
      { label: "Change avatar", run: () => setChoosingAvatar(player) },
      { label: "Remove player", danger: true, run: () => onDiscard(player) },
    ];
  }

  function subtitle(row: ProfileRow) {
    // Any host's games you both played in (user request, 2026-10-02).
    const count = row.together;
    const games =
      count === undefined
        ? ""
        : ` · Played ${count} game${count === 1 ? "" : "s"} together`;
    switch (row.kind) {
      case "self":
        return "You";
      case "friend":
        return `Friend${games}`;
      case "pending":
        return "Request sent · waiting";
      case "removed":
        return row.games ? "Removed · history kept" : "Removed";
      default:
        return `Guest${games}`;
    }
  }

  const freePlayers = players.filter(
    (player) => !player.linked && player.id !== profile.selfPlayerId,
  );
  const playersById = new Map(players.map((player) => [player.id, player]));
  const linkable = linkableFriends(overview?.friends ?? [], playersById);
  const gamesOf = (playerId: string | undefined) => {
    const player = playerId ? playersById.get(playerId) : undefined;
    return player ? record(player).games : 0;
  };
  const filters: Array<[PlayerFilter, string]> = [
    ["all", "All"],
    ["app", "Friends"],
    ["guest", "Guests"],
  ];

  return (
    <div className="stack-list profile-screen">
      <ProfileCard
        profile={profile}
        accountEmail={accountEmail}
        onOpenSettings={onOpenSettings}
        onProfile={onProfile}
        onScannedCode={(code) => {
          setScannedCode(code);
          setAdding(true);
        }}
        onToast={onToast}
        stats={stats}
        statsError={statsError}
        onSignOut={onSignOut}
      />

      {overview?.received.map((request) => (
        <FriendRequestCard
          key={request.requestId}
          request={request}
          guests={freePlayers}
          busy={busy}
          onAnswered={(accepted) => {
            reloadOverview();
            if (accepted) onPlayersChanged();
          }}
          run={run}
          onToast={onToast}
        />
      ))}

      <div className="profile-players-heading">
        <h2>
          <span>{players.length}</span>{" "}
          {players.length === 1 ? "Player" : "Players"}
        </h2>
        <button
          className="profile-add-button"
          type="button"
          onClick={() => setAdding(true)}
        >
          <span aria-hidden="true">+</span>Add
        </button>
      </div>

      <div className="profile-filters" role="group" aria-label="Show players">
        {filters.map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={filter === key ? "selected" : ""}
            aria-pressed={filter === key}
            onClick={() => {
              setFilter(key);
              setMenu(null);
            }}
          >
            {label}
            <span>{counts[key]}</span>
          </button>
        ))}
      </div>

      <section className="glass profile-list">
        {error ? (
          <div className="directory-state">
            <p className="muted">{error}</p>
            <button className="ghost full" type="button" onClick={onRetry}>
              Try again
            </button>
          </div>
        ) : loading ? (
          <p className="muted profile-list-note">Loading players…</p>
        ) : rows.length ? (
          rows.map((row) => {
            const actions = actionsFor(row);
            const open = menu === row.key;
            return (
              <div className="profile-row-wrap" key={row.key}>
                <PressableRow
                  className={`profile-row${row.kind === "removed" ? " removed" : ""}`}
                  onLongPress={
                    actions.length ? (element) => openMenu(row.key, element) : null
                  }
                >
                  <span className="profile-avatar" aria-hidden="true">
                    <AvatarArt id={row.avatar} seed={row.name} />
                  </span>
                  <span className="profile-row-copy">
                    <b className="name-with-badge">
                      <span>{row.name}</span>
                      {hasAccount(row) && row.kind !== "removed" ? (
                        <PokerizeBadge name={row.name} isMe={row.kind === "self"} />
                      ) : null}
                    </b>
                    <small className={`row-kind-${row.kind}`}>{subtitle(row)}</small>
                  </span>
                  {actions.length ? (
                    <button
                      className="profile-more"
                      type="button"
                      aria-label={`Options for ${row.name}`}
                      aria-expanded={open}
                      disabled={busy !== ""}
                      onClick={(event) => {
                        if (open) setMenu(null);
                        else openMenu(row.key, event.currentTarget);
                      }}
                    >
                      ⋯
                    </button>
                  ) : null}
                </PressableRow>
                {open ? (
                  <>
                    <button
                      className="profile-menu-scrim"
                      type="button"
                      aria-label="Close options"
                      onClick={() => setMenu(null)}
                    />
                    <div
                      className={`profile-menu${menuAbove ? " above" : ""}`}
                      role="menu"
                    >
                      {actions.map((action) => (
                        <button
                          key={action.label}
                          type="button"
                          role="menuitem"
                          className={action.danger ? "danger-text" : ""}
                          onClick={() => {
                            setMenu(null);
                            action.run();
                          }}
                        >
                          {action.label}
                        </button>
                      ))}
                    </div>
                  </>
                ) : null}
              </div>
            );
          })
        ) : (
          <p className="muted profile-list-note">No players here yet</p>
        )}
      </section>

      {overviewError ? (
        <div className="inline-state">
          <span>{overviewError}</span>
          <button className="pill-button" type="button" onClick={reloadOverview}>
            Try again
          </button>
        </div>
      ) : null}
      {removedRows.length ? (
        <button
          className="profile-removed-toggle"
          type="button"
          onClick={() => setShowRemoved((shown) => !shown)}
        >
          {showRemoved
            ? "Hide removed players"
            : `Show ${removedRows.length} removed player${removedRows.length === 1 ? "" : "s"}`}
        </button>
      ) : null}

      {adding ? (
        <AddPlayerSheet
          players={players}
          initialCode={scannedCode}
          onAdd={onAdd}
          onRequestSent={() => {
            reloadOverview();
            setFilter("all");
          }}
          onToast={onToast}
          onClose={() => {
            setAdding(false);
            setScannedCode(null);
          }}
        />
      ) : null}
      {renaming ? (
        <RenameSheet
          player={renaming}
          players={[...players, ...discardedPlayers]}
          onRename={onRename}
          onClose={() => setRenaming(null)}
        />
      ) : null}
      {choosingAvatar ? (
        <AvatarSheet
          title={`Avatar for ${choosingAvatar.name}`}
          note={`People on ${APP_NAME} choose their own. You choose for your guests.`}
          current={choosingAvatar.avatar}
          seed={choosingAvatar.name}
          onPick={(avatar) => onGuestAvatar(choosingAvatar, avatar)}
          onClose={() => setChoosingAvatar(null)}
        />
      ) : null}
      {inviting ? (
        <InviteSheet
          guest={inviting}
          hostName={profile.displayName ?? "Your host"}
          onToast={onToast}
          onClose={() => setInviting(null)}
        />
      ) : null}
      {linking ? (
        <LinkFriendSheet
          guest={linking}
          friends={linkable.map((friend) => ({
            friend,
            games: gamesOf(friend.myPlayer?.id),
            seated: !!friend.myPlayer && seatedPlayerIds.includes(friend.myPlayer.id),
          }))}
          onLinked={(merged) => {
            onToast(merged ? "Games Merged" : "Guest Linked");
            onPlayersChanged();
            if (merged) onGamesMoved();
            reloadOverview();
          }}
          onClose={() => setLinking(null)}
        />
      ) : null}
    </div>
  );
}

/**
 * Profile's ⋯ button: who is signed in, Edit name and Sign out. Delete My
 * Account lives in Settings only (user decision 2026-10-05).
 */
function AccountMenu({
  email,
  onEditName,
  onSignOut,
}: {
  email: string;
  onEditName: () => void;
  onSignOut: () => void;
}) {
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    // The card's blur makes a fixed scrim cover only the card, so a press
    // anywhere outside the menu closes it instead.
    function closeOutside(event: PointerEvent) {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    }
    window.addEventListener("keydown", closeOnEscape);
    document.addEventListener("pointerdown", closeOutside);
    return () => {
      window.removeEventListener("keydown", closeOnEscape);
      document.removeEventListener("pointerdown", closeOutside);
    };
  }, [open]);

  return (
    <div className="account-menu" ref={container}>
      <button
        className="profile-edit"
        type="button"
        aria-label="Account"
        aria-expanded={open}
        onClick={() => setOpen((shown) => !shown)}
      >
        ⋯
      </button>
      {open ? (
        <div className="profile-menu account-menu-list" role="menu">
          <div className="account-menu-who">
            <small>Signed in as</small>
            <b className="literal-text">{email}</b>
          </div>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onEditName();
            }}
          >
            Edit name
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onSignOut();
            }}
          >
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** A row that opens its options on a long press or a right click. */
function PressableRow({
  className,
  onLongPress,
  children,
}: {
  className: string;
  onLongPress: ((element: Element) => void) | null;
  children: ReactNode;
}) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancel = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => cancel, []);
  return (
    <div
      className={className}
      onPointerDown={(event) => {
        cancel();
        const element = event.currentTarget;
        if (onLongPress) {
          timer.current = setTimeout(() => onLongPress(element), LONG_PRESS_MS);
        }
      }}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      onContextMenu={(event) => {
        if (!onLongPress) return;
        event.preventDefault();
        onLongPress(event.currentTarget);
      }}
    >
      {children}
    </div>
  );
}

/** The card at the top: name, record, user code, currency and Settings. */
function ProfileCard({
  profile,
  accountEmail,
  onOpenSettings,
  onSignOut,
  onProfile,
  onScannedCode,
  onToast,
  stats,
  statsError,
}: {
  profile: AccountProfile;
  accountEmail: string;
  onOpenSettings: () => void;
  onProfile: (profile: AccountProfile) => void;
  /** A friend's user code read with Scan Code. */
  onScannedCode: (code: string) => void;
  onToast: (message: string) => void;
  stats: ProfileSummary | null;
  statsError: string;
  onSignOut: () => void;
}) {
  const { signedMoney } = useMoney();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [nameError, setNameError] = useState("");
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [codeMenu, setCodeMenu] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [choosingAvatar, setChoosingAvatar] = useState(false);
  const [showingCode, setShowingCode] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
    },
    [],
  );

  const name = profile.displayName ?? "";

  async function saveName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    let displayName: string;
    try {
      displayName = cleanDisplayName(draft);
    } catch (error) {
      setNameError(error instanceof Error ? error.message : "Enter your name");
      return;
    }
    if (displayName === name) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      const data = await accountApi<{ profile: AccountProfile }>({
        action: "update-profile",
        displayName,
      });
      onProfile(data.profile);
      setEditing(false);
      setNameError("");
      onToast("Name Saved");
    } catch (error) {
      setNameError(
        error instanceof Error ? error.message : "Could not save your name",
      );
    } finally {
      setSaving(false);
    }
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(formatUserCode(profile.userCode));
      setCopied(true);
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopied(false), 1400);
    } catch {
      // Clipboard blocked: the code is on screen to copy by hand.
    }
  }

  async function replaceCode() {
    setCodeMenu(false);
    setReplacing(true);
    try {
      const data = await accountApi<{ profile: AccountProfile }>({
        action: "replace-code",
      });
      onProfile(data.profile);
      onToast("New Code Ready");
    } catch (error) {
      onToast(
        error instanceof Error ? error.message : "Could not replace your code",
      );
    } finally {
      setReplacing(false);
    }
  }

  async function changeAvatar(avatar: string) {
    try {
      const data = await accountApi<{ profile: AccountProfile }>({
        action: "set-avatar",
        avatar,
      });
      onProfile(data.profile);
      onToast("Avatar Saved");
      return true;
    } catch (error) {
      onToast(
        error instanceof Error ? error.message : "Could not save your avatar",
      );
      return false;
    }
  }

  async function changeCurrency(currency: string) {
    try {
      const data = await accountApi<{ profile: AccountProfile }>({
        action: "set-currency",
        currency,
      });
      onProfile(data.profile);
      onToast("Currency Saved");
    } catch (error) {
      onToast(
        error instanceof Error ? error.message : "Could not save your currency",
      );
    }
  }

  // The headline has room for whole amounts only; from 1,000 up the cents
  // from small-stakes games are dropped here (the bars' titles keep them).
  const netText = stats
    ? signedMoney(Math.abs(stats.net) >= 1_000 ? Math.round(stats.net) : stats.net)
    : "–";
  const recent = stats?.recent ?? [];
  const largest = Math.max(1, ...recent.map((game) => Math.abs(game.net)));
  const bar = (value: number) =>
    value ? Math.max(3, Math.round((Math.abs(value) / largest) * 20)) : 0;
  const tiles: Array<[string, string, string]> = [
    ["Games played", stats ? String(stats.games) : "–", ""],
    [
      "Avg return",
      stats?.averageReturn == null ? "–" : formatShortPercent(stats.averageReturn),
      toneClass(stats?.averageReturn ?? null),
    ],
    [
      "Profitable",
      stats ? `${stats.profitableGames}/${stats.games}` : "–",
      "blue",
    ],
  ];

  return (
    <>
    <section className="glass profile-card">
      <span className="profile-card-glow" aria-hidden="true" />
      <div className="profile-identity">
        <button
          className="profile-ring"
          type="button"
          aria-label="Change your avatar"
          onClick={() => setChoosingAvatar(true)}
        >
          <span>
            <AvatarArt id={profile.avatar} seed={name} />
          </span>
          <span className="profile-ring-edit" aria-hidden="true">
            <svg viewBox="0 0 16 16" width="12" height="12">
              <path
                d="M10.6 2.6l2.8 2.8-7.6 7.6H3v-2.8z"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        </button>
        <div className="profile-name">
          {editing ? (
            <form className="profile-name-form" onSubmit={saveName}>
              <input
                className="field"
                aria-label="Your name"
                autoFocus
                maxLength={MAX_DISPLAY_NAME_LENGTH}
                value={draft}
                onChange={(event) => {
                  setDraft(event.target.value);
                  if (nameError) setNameError("");
                }}
                onKeyDown={(event) => {
                  if (event.key === "Escape") setEditing(false);
                }}
              />
              <button className="accent-button" type="submit" disabled={saving}>
                {saving ? "Saving…" : "Save"}
              </button>
            </form>
          ) : (
            <>
              <h2 className={name.length > 9 ? "long" : ""}>{name}</h2>
              <p>
                {stats?.firstPlayed
                  ? `Playing since ${monthYear(stats.firstPlayed)}`
                  : stats
                    ? "No games yet"
                    : " "}
              </p>
            </>
          )}
          {nameError ? (
            <p className="field-error" role="alert">
              {nameError}
            </p>
          ) : null}
        </div>
        {editing ? null : (
          <AccountMenu
            email={accountEmail}
            onEditName={() => {
              setDraft(name);
              setEditing(true);
            }}
            onSignOut={onSignOut}
          />
        )}
      </div>

      <div className="profile-record">
        <div>
          <span className="profile-kicker">All-time net</span>
          <strong
            className={`profile-net ${
              stats && stats.net < 0 ? "neg" : "gradient-text-vertical"
            }${netText.length > 9 ? " long" : netText.length > 7 ? " wide" : ""}`}
          >
            {netText}
          </strong>
        </div>
        {recent.length ? (
          <div className="profile-form">
            <span className="profile-kicker">Last {recent.length}</span>
            <div className="profile-bars" aria-label="Net of your latest games">
              {recent.map((game, index) => (
                <span
                  className="profile-bar"
                  key={index}
                  title={`${formatDate(game.date)}: ${signedMoney(game.net)}`}
                >
                  <span>
                    <i className="up" style={{ height: game.net > 0 ? bar(game.net) : 0 }} />
                  </span>
                  <span>
                    <i className="down" style={{ height: game.net < 0 ? bar(game.net) : 0 }} />
                  </span>
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </div>
      {stats?.otherCurrencyGames ? (
        <p className="profile-note">
          Net leaves out {stats.otherCurrencyGames} game
          {stats.otherCurrencyGames === 1 ? "" : "s"} played in another currency.
        </p>
      ) : null}
      {statsError ? <p className="profile-note">{statsError}</p> : null}

      <div className="profile-tiles">
        {tiles.map(([label, value, tone]) => (
          <div key={label}>
            <strong className={tone}>{value}</strong>
            <small>{label}</small>
          </div>
        ))}
      </div>

      <div className="profile-code-row">
        <div>
          <small>Your user code · friends add you with it</small>
          <strong>{formatUserCode(profile.userCode)}</strong>
        </div>
        <button
          className={`profile-more bordered profile-copy${copied ? " accent-text" : ""}`}
          type="button"
          aria-label={copied ? "Copied" : "Copy your user code"}
          title={copied ? "Copied" : "Copy"}
          onClick={() => void copyCode()}
        >
          <svg
            viewBox="0 0 24 24"
            width="16"
            height="16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            {copied ? (
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            ) : (
              <>
                <rect x="9" y="9" width="11" height="11" rx="2.5" />
                <path d="M15 9V6.5A2.5 2.5 0 0 0 12.5 4h-6A2.5 2.5 0 0 0 4 6.5v6A2.5 2.5 0 0 0 6.5 15H9" />
              </>
            )}
          </svg>
        </button>
        <button
          className="profile-more bordered profile-copy"
          type="button"
          aria-label="Show your QR code or scan a friend's"
          title="QR code"
          onClick={() => setShowingCode(true)}
        >
          {QR_ICON}
        </button>
        <div className="profile-code-more">
          <button
            className="profile-more bordered"
            type="button"
            aria-label="More about your code"
            aria-expanded={codeMenu}
            disabled={replacing}
            onClick={() => setCodeMenu((shown) => !shown)}
          >
            ⋯
          </button>
          {codeMenu ? (
            <>
              <button
                className="profile-menu-scrim"
                type="button"
                aria-label="Close options"
                onClick={() => setCodeMenu(false)}
              />
              <div className="profile-menu above" role="menu">
                <button type="button" role="menuitem" onClick={() => void replaceCode()}>
                  Replace code
                </button>
                <p>Old code stops working. Existing friends stay.</p>
              </div>
            </>
          ) : null}
        </div>
      </div>

      <label className="profile-currency">
        <span>
          <small>Currency · for the games you host</small>
          <b>{CURRENCIES.find((item) => item.code === profile.currency)?.name}</b>
        </span>
        <select
          className="select-control"
          value={profile.currency}
          onChange={(event) => void changeCurrency(event.target.value)}
        >
          {CURRENCIES.map((currency) => (
            <option key={currency.code} value={currency.code}>
              {`${currency.symbol.trim()} ${currency.code}`}
            </option>
          ))}
        </select>
      </label>
      <button className="profile-settings-link" type="button" onClick={onOpenSettings}>
        <span>
          <small>Sounds, privacy and more</small>
          <b>Settings</b>
        </span>
        <span className="settings-chevron" aria-hidden="true">
          ›
        </span>
      </button>
    </section>
    {/* Outside the card: its blur would trap a fixed-position sheet. */}
    {choosingAvatar ? (
      <AvatarSheet
        title="Your avatar"
        note="Everyone sees you with this avatar, in every host's list and on live links."
        current={profile.avatar}
        seed={name}
        onPick={changeAvatar}
        onClose={() => setChoosingAvatar(false)}
      />
    ) : null}
    {showingCode ? (
      <UserCodeSheet
        userCode={profile.userCode}
        onScanned={(code) => {
          setShowingCode(false);
          onScannedCode(code);
        }}
        onClose={() => setShowingCode(false)}
      />
    ) : null}
    </>
  );
}
