"use client";

import { useEffect, useRef, useState } from "react";

import { AvatarArt } from "@/components/avatar-art";
import {
  friendNotifications,
  shortTimeAgo,
} from "@/lib/friends/notifications";
import type { FriendOverview } from "@/lib/friends/requests";

/** When this device last opened the bell; friendships after it are new. */
const SEEN_STORAGE_KEY = "pokerLedger.notificationsSeenAt.v1";

function readSeenAt() {
  try {
    const stored = Number(window.localStorage.getItem(SEEN_STORAGE_KEY));
    if (stored > 0) return stored;
    // First visit: start from now rather than flagging every friend as new.
    const now = Date.now();
    window.localStorage.setItem(SEEN_STORAGE_KEY, String(now));
    return now;
  } catch {
    return Date.now();
  }
}

function storeSeenAt(at: number) {
  try {
    window.localStorage.setItem(SEEN_STORAGE_KEY, String(at));
  } catch {
    // Private windows may refuse storage; the badge clears this visit only.
  }
}

/**
 * The bell beside the theme switch on Profile. It lists friend requests
 * waiting for an answer and friendships made in the last 30 days.
 */
export function NotificationBell({
  overview,
  onOpenRequest,
}: {
  overview: FriendOverview | null;
  /** Brings a waiting request's card into view so it can be answered. */
  onOpenRequest: (requestId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [seenAt, setSeenAt] = useState<number | null>(null);
  // What was new when the list opened, so it stays highlighted while shown.
  const [listSince, setListSince] = useState(Infinity);
  const [now, setNow] = useState(0);
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSeenAt(readSeenAt());
      setNow(Date.now());
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!open) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
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

  // Until storage is read, nothing counts as new.
  const items = friendNotifications(overview, seenAt ?? Infinity, now);
  const unread = items.filter((item) => item.unread).length;
  const listed = friendNotifications(overview, listSince, now);
  const label = unread
    ? `Notifications, ${unread} new`
    : "Notifications";

  return (
    <div className="notification-menu" ref={container}>
      <button
        className="round-button notification-bell"
        type="button"
        aria-label={label}
        title={label}
        aria-expanded={open}
        onClick={() => {
          if (!open) {
            // Opening clears the badge; the list still marks what was new.
            const at = Date.now();
            setNow(at);
            setListSince(seenAt ?? at);
            setSeenAt(at);
            storeSeenAt(at);
          }
          setOpen((shown) => !shown);
        }}
      >
        <BellIcon />
        {unread ? (
          <span className="notification-count" aria-hidden="true">
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </button>
      {open ? (
        <div className="notification-list" role="dialog" aria-label="Notifications">
          <h2>Notifications</h2>
          {listed.length ? (
            <ul>
              {listed.map((item) => (
                <li key={item.key} className={item.unread ? "unread" : ""}>
                  <span className="profile-avatar" aria-hidden="true">
                    <AvatarArt id={item.avatar} seed={item.displayName} />
                  </span>
                  <div className="notification-text">
                    <p>
                      {item.kind === "request" ? (
                        <>
                          <b>{item.displayName}</b> sent you a friend request
                        </>
                      ) : (
                        <>
                          You and <b>{item.displayName}</b> are now friends
                        </>
                      )}
                    </p>
                    <small>{shortTimeAgo(item.at, now)}</small>
                  </div>
                  {item.kind === "request" ? (
                    <button
                      className="notification-action"
                      type="button"
                      onClick={() => {
                        setOpen(false);
                        onOpenRequest(item.requestId);
                      }}
                    >
                      Answer
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="notification-empty">You&apos;re all caught up</p>
          )}
        </div>
      ) : null}
    </div>
  );
}

function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 2.5a1.4 1.4 0 0 0-1.4 1.4v.6A6.3 6.3 0 0 0 5.7 10.7v3.6l-1.6 2.5a.9.9 0 0 0 .8 1.4h14.2a.9.9 0 0 0 .8-1.4l-1.6-2.5v-3.6a6.3 6.3 0 0 0-4.9-6.2v-.6A1.4 1.4 0 0 0 12 2.5Z"
      />
      <path fill="currentColor" d="M9.4 19.6a2.7 2.7 0 0 0 5.2 0Z" />
    </svg>
  );
}
