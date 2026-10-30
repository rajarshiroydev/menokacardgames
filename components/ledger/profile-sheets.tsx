"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

import { AvatarArt } from "@/components/avatar-art";
import { AvatarPicker, randomAvatarId } from "@/components/avatar-picker";
import { ApiError, friendsApi } from "@/components/ledger/api";
import { QrScanner, SCAN_ICON } from "@/components/ledger/share-sheets";
import { PokerizeBadge } from "@/components/pokerize-badge";
import { formatUserCode } from "@/lib/accounts/identity-code";
import { AVATARS } from "@/lib/avatars";
import { APP_NAME } from "@/lib/brand";
import type { FoundAccount, FriendOverview } from "@/lib/friends/requests";
import { playerNameKey } from "@/lib/poker/player-validation";
import type { PlayerProfile } from "@/lib/poker/types";

/** A friend request sent to you, answered right on the Profile tab. */
export function FriendRequestCard({
  request,
  guests,
  busy,
  run,
  onAnswered,
  onToast,
}: {
  request: FriendOverview["received"][number];
  /** Your guests that could be linked to them instead. */
  guests: PlayerProfile[];
  busy: string;
  run: (key: string, action: () => Promise<void>) => Promise<void>;
  onAnswered: (accepted: boolean) => void;
  onToast: (message: string) => void;
}) {
  // Accepting adds them as a new player. If that name is taken by one of
  // your guests, the card offers to link that guest instead (2026-10-02,
  // user decision); otherwise "Link to guest…" does it afterwards.
  const [newName, setNewName] = useState(request.displayName ?? "");
  const [error, setError] = useState("");
  const [nameTaken, setNameTaken] = useState(false);
  const [clashingGuest, setClashingGuest] = useState<PlayerProfile | null>(null);
  const name = request.displayName ?? "Someone";

  function answer(action: "accept" | "decline", linkGuest?: PlayerProfile) {
    void run(request.requestId, async () => {
      setError("");
      try {
        await friendsApi(
          action === "accept"
            ? {
                action,
                requestId: request.requestId,
                myPlayerId: linkGuest?.id ?? null,
                newPlayerName: linkGuest ? null : newName,
              }
            : { action, requestId: request.requestId },
        );
        onToast(
          action === "decline"
            ? "Request Declined"
            : linkGuest
              ? "Friend Added · Guest Linked"
              : "Friend Added",
        );
        onAnswered(action === "accept");
      } catch (error) {
        if (error instanceof ApiError && error.code === "friend-name-taken") {
          setNameTaken(true);
          // An empty box means their own name, as on the server.
          const key = playerNameKey(newName.trim() || name);
          const guest =
            guests.find((player) => playerNameKey(player.name) === key) ?? null;
          setClashingGuest(guest);
          if (guest) {
            setError(
              `${guest.name} is already one of your guests. Link them to keep their games, or choose another name`,
            );
            return;
          }
        }
        setError(
          error instanceof Error ? error.message : "Could not answer the request",
        );
      }
    });
  }

  return (
    <section
      className="glass profile-request"
      id={`friend-request-${request.requestId}`}
    >
      <div className="profile-request-head">
        <span className="profile-avatar" aria-hidden="true">
          <AvatarArt id={request.avatar} seed={name} />
        </span>
        <div>
          <span className="eyebrow">Friend request</span>
          <p>
            <b>{name}</b> wants to be friends
          </p>
        </div>
      </div>
      {nameTaken ? (
        <input
          className="field"
          aria-label="New player's name"
          maxLength={80}
          value={newName}
          onChange={(event) => setNewName(event.target.value)}
        />
      ) : null}
      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : null}
      {clashingGuest ? (
        <button
          className="accent-button friend-link-guest"
          type="button"
          disabled={busy !== ""}
          onClick={() => answer("accept", clashingGuest)}
        >
          Link to Guest {clashingGuest.name}
        </button>
      ) : null}
      <div className="friend-actions">
        <button
          className={clashingGuest ? "ghost" : "accent-button"}
          type="button"
          disabled={busy !== ""}
          onClick={() => answer("accept")}
        >
          {busy === request.requestId ? "Saving…" : "Accept"}
        </button>
        <button
          className="ghost"
          type="button"
          disabled={busy !== ""}
          onClick={() => answer("decline")}
        >
          Decline
        </button>
      </div>
    </section>
  );
}

/** The Add sheet: a friend on Pokerize by user code, or a guest by name. */
export function AddPlayerSheet({
  players,
  initialCode,
  onAdd,
  onRequestSent,
  onToast,
  onClose,
}: {
  players: PlayerProfile[];
  /** A user code already scanned, looked up as the sheet opens. */
  initialCode: string | null;
  onAdd: (name: string, avatar: string) => Promise<PlayerProfile | null>;
  onRequestSent: () => void;
  onToast: (message: string) => void;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<"code" | "name">("code");
  const [input, setInput] = useState(
    initialCode ? formatUserCode(initialCode) : "",
  );
  const [scanning, setScanning] = useState(false);
  const [guestAvatar, setGuestAvatar] = useState(randomAvatarId);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [found, setFound] = useState<(FoundAccount & { code: string }) | null>(
    null,
  );

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  const byCode = mode === "code";
  const relationNote: Record<FoundAccount["relation"], string> = {
    self: "That's your own code.",
    friends: "You're already friends.",
    "request-sent": "You've already sent them a request.",
    "request-received": "They've sent you a request. Answer it on your profile.",
    none: "",
  };

  async function findCode(value: string) {
    setError("");
    setFound(null);
    setBusy(true);
    try {
      const data = await friendsApi<{ found: FoundAccount }>({
        action: "find",
        code: value,
      });
      setFound({ ...data.found, code: value });
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Could not look up that code",
      );
    } finally {
      setBusy(false);
    }
  }

  // Look up a code scanned on the profile card once, as the sheet opens.
  const lookedUpInitial = useRef(false);
  useEffect(() => {
    if (!initialCode || lookedUpInitial.current) return;
    lookedUpInitial.current = true;
    void findCode(initialCode);
  }, [initialCode]);

  function scanned(code: string) {
    setScanning(false);
    setInput(formatUserCode(code));
    void findCode(code);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const value = input.trim();
    setError("");
    setFound(null);
    if (byCode) {
      if (!value) {
        setError("Enter their user code");
        return;
      }
      await findCode(value);
      return;
    }
    if (!value) {
      setError("Enter a name");
      return;
    }
    const existing = players.find(
      (player) => player.name.trim().toLowerCase() === value.toLowerCase(),
    );
    if (existing) {
      setError(`You already have a player called ${existing.name}`);
      return;
    }
    setBusy(true);
    const player = await onAdd(value, guestAvatar);
    setBusy(false);
    if (player) onClose();
  }

  async function send() {
    if (!found || busy) return;
    setBusy(true);
    setError("");
    try {
      await friendsApi({
        action: "send",
        code: found.code,
      });
      onToast("Request Sent");
      onRequestSent();
      onClose();
    } catch (error) {
      setError(error instanceof Error ? error.message : "The request was not sent");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="modal show"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="sheet profile-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-player-title"
      >
        <span className="sheet-grabber" aria-hidden="true" />
        <h2 id="add-player-title">Add player</h2>
        <div className="profile-modes" role="group" aria-label="Who are you adding">
          {(
            [
              ["code", "Find Friend"],
              ["name", "Add Guest"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={mode === key ? "selected" : ""}
              aria-pressed={mode === key}
              onClick={() => {
                setMode(key);
                setInput("");
                setError("");
                setFound(null);
                setScanning(false);
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="muted small-note">
          {byCode
            ? "Enter or scan their user code to add them as a friend."
            : "Add someone who doesn't use the app."}
        </p>
        {scanning ? (
          <>
            <QrScanner onCode={scanned} />
            <button
              className="ghost full"
              type="button"
              onClick={() => setScanning(false)}
            >
              Type code instead
            </button>
          </>
        ) : (
        <form className="add-player-row" onSubmit={submit}>
          <input
            className={`field${byCode ? " code-field" : ""}`}
            aria-label={byCode ? "Their user code" : "Their name"}
            autoCapitalize={byCode ? "characters" : "words"}
            autoComplete="off"
            autoFocus={!initialCode}
            maxLength={byCode ? 12 : 80}
            placeholder={byCode ? "XXXX-XXXX" : "Their name"}
            value={input}
            onChange={(event) => {
              setInput(event.target.value);
              setError("");
              setFound(null);
            }}
          />
          {byCode ? (
            <button
              className="profile-more bordered add-player-scan"
              type="button"
              aria-label="Scan their QR code"
              title="Scan QR code"
              disabled={busy}
              onClick={() => {
                setError("");
                setFound(null);
                setScanning(true);
              }}
            >
              {SCAN_ICON}
            </button>
          ) : null}
          <button className="accent-button" type="submit" disabled={busy}>
            {busy && !found ? (byCode ? "Finding…" : "Adding…") : byCode ? "Find" : "Add"}
          </button>
        </form>
        )}
        {error ? (
          <p className="field-error" role="alert">
            {error}
          </p>
        ) : null}
        {byCode ? null : (
          <AvatarPicker
            value={guestAvatar}
            seed={input}
            disabled={busy}
            onChange={setGuestAvatar}
          />
        )}
        {found ? (
          <div className="profile-found">
            <div className="profile-found-head">
              <span className="profile-avatar" aria-hidden="true">
                <AvatarArt id={found.avatar} seed={found.displayName ?? ""} />
              </span>
              <span className="profile-row-copy">
                <b className="name-with-badge">
                  <span>{found.displayName ?? "Someone without a name yet"}</span>
                  <PokerizeBadge name={found.displayName ?? undefined} />
                </b>
                <small>
                  {found.relation === "none" ? `On ${APP_NAME}` : relationNote[found.relation]}
                </small>
              </span>
              {found.relation === "none" ? (
                <button
                  className="accent-button small"
                  type="button"
                  disabled={busy}
                  onClick={() => void send()}
                >
                  {busy ? "Sending…" : "Send request"}
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Links a guest to one of your friends, so the guest's games count as theirs.
 * The player made for the friend when the request was accepted is deleted;
 * any games it has move to the guest first, which can't be undone.
 */
export function LinkFriendSheet({
  guest,
  friends,
  onLinked,
  onClose,
}: {
  guest: PlayerProfile;
  /** Friends this guest may be (lib/friends/link-guest.ts), with their
   * player's saved games (which would be merged) and whether that player is
   * in the game in progress. */
  friends: Array<{
    friend: FriendOverview["friends"][number];
    games: number;
    seated: boolean;
  }>;
  onLinked: (merged: boolean) => void;
  onClose: () => void;
}) {
  const [accountId, setAccountId] = useState(friends[0]?.friend.accountId ?? "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const chosen = friends.find((item) => item.friend.accountId === accountId);
  const games = chosen?.games ?? 0;
  const friendName = chosen?.friend.displayName ?? "This friend";

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  async function link(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || !chosen || chosen.seated) return;
    setSaving(true);
    setError("");
    try {
      await friendsApi({ action: "link-guest", accountId, playerId: guest.id });
      onLinked(games > 0);
      onClose();
    } catch (error) {
      setError(error instanceof Error ? error.message : "The guest was not linked");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="modal show"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <form
        className="sheet profile-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="link-friend-title"
        onSubmit={link}
      >
        <span className="sheet-grabber" aria-hidden="true" />
        <h2 id="link-friend-title">Link to friend</h2>
        {friends.length ? (
          <p className="muted small-note">
            Which friend is {guest.name}? Their games will move to that friend.
          </p>
        ) : null}
        {friends.length ? (
          <div className="add-player-row">
            <select
              className="select-control"
              aria-label="Friend"
              value={accountId}
              onChange={(event) => {
                setAccountId(event.target.value);
                setError("");
              }}
            >
              {friends.map(({ friend }) => (
                <option key={friend.accountId} value={friend.accountId}>
                  {friend.displayName ?? "Unnamed friend"}
                </option>
              ))}
            </select>
            <button
              className="accent-button"
              type="submit"
              disabled={saving || !!chosen?.seated}
            >
              {saving ? "Linking…" : games > 0 ? "Merge" : "Link"}
            </button>
          </div>
        ) : (
          <p className="muted small-note">
            No friends to link yet. When {guest.name} joins Pokerize and
            accepts your friend request, you can link them here.
          </p>
        )}
        {chosen?.seated ? (
          <p className="field-error" role="alert">
            {friendName} is in the game in progress. End or discard it first.
          </p>
        ) : games > 0 ? (
          <p className="field-error" role="note">
            {friendName} already has {games} game{games === 1 ? "" : "s"} in
            your list. They&apos;ll be merged into {guest.name}. This
            can&apos;t be undone.
          </p>
        ) : null}
        {error ? (
          <p className="field-error" role="alert">
            {error}
          </p>
        ) : null}
      </form>
    </div>
  );
}

/** Renames a guest. People on Pokerize choose their own name. */
/** Picks an avatar: tapping one selects it, Save Avatar saves it. */
export function AvatarSheet({
  title,
  note,
  current,
  seed,
  onPick,
  onClose,
}: {
  title: string;
  note: string;
  current: string | undefined;
  seed: string;
  onPick: (avatar: string) => Promise<boolean>;
  onClose: () => void;
}) {
  const [saving, setSaving] = useState("");
  const [chosen, setChosen] = useState(current ?? "");

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  async function save(avatar: string) {
    setSaving(avatar);
    const saved = await onPick(avatar);
    setSaving("");
    if (saved) onClose();
  }

  return (
    <div
      className="modal show"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="sheet profile-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="avatar-sheet-title"
      >
        <span className="sheet-grabber" aria-hidden="true" />
        <h2 id="avatar-sheet-title">{title}</h2>
        <p className="muted small-note">{note}</p>
        <div className="avatar-grid" role="group" aria-label="Avatars">
          {AVATARS.map((avatar, index) => (
            <button
              key={avatar.id}
              type="button"
              className={`avatar-choice${
                avatar.id === chosen ? " selected" : ""
              }${saving === avatar.id ? " saving" : ""}`}
              aria-label={`Avatar ${index + 1}`}
              aria-pressed={avatar.id === chosen}
              disabled={saving !== ""}
              onClick={() => setChosen(avatar.id)}
            >
              <AvatarArt id={avatar.id} seed={seed} />
            </button>
          ))}
        </div>
        <button
          className="primary"
          type="button"
          disabled={saving !== "" || chosen === "" || chosen === current}
          onClick={() => void save(chosen)}
        >
          {saving ? "Saving…" : "Save Avatar"}
        </button>
      </div>
    </div>
  );
}

export function RenameSheet({
  player,
  players,
  onRename,
  onClose,
}: {
  player: PlayerProfile;
  players: PlayerProfile[];
  onRename: (player: PlayerProfile, name: string) => Promise<boolean>;
  onClose: () => void;
}) {
  const [name, setName] = useState(player.name);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const trimmed = name.trim().replace(/\s+/g, " ");
    if (!trimmed) {
      setError("Enter a name");
      return;
    }
    if (trimmed === player.name) {
      onClose();
      return;
    }
    const taken = players.find(
      (other) =>
        other.id !== player.id &&
        other.name.trim().toLowerCase() === trimmed.toLowerCase(),
    );
    if (taken) {
      setError(`You already have a player called ${taken.name}`);
      return;
    }
    setSaving(true);
    const saved = await onRename(player, trimmed);
    setSaving(false);
    if (saved) onClose();
  }

  return (
    <div
      className="modal show"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <form
        className="sheet profile-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rename-player-title"
        onSubmit={save}
      >
        <span className="sheet-grabber" aria-hidden="true" />
        <h2 id="rename-player-title">Rename</h2>
        <p className="muted small-note">
          Their standings and future games use the new name. Saved games keep
          the name they were played under.
        </p>
        <div className="add-player-row">
          <input
            className="field"
            aria-label="New name"
            autoFocus
            maxLength={80}
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              setError("");
            }}
          />
          <button className="accent-button" type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
        {error ? (
          <p className="field-error" role="alert">
            {error}
          </p>
        ) : null}
      </form>
    </div>
  );
}
