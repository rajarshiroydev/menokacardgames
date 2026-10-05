import type { FriendOverview } from "./requests.ts";

/** How long a new friendship stays in the notification list. */
export const NEW_FRIEND_DAYS = 30;

export type FriendNotification =
  | {
      kind: "request";
      key: string;
      requestId: string;
      displayName: string;
      avatar?: string;
      at: number;
      unread: boolean;
    }
  | {
      kind: "friend";
      key: string;
      displayName: string;
      avatar?: string;
      at: number;
      unread: boolean;
    };

/**
 * The notifications the bell lists, newest first, built from the friends
 * overview the app already loads. A waiting request stays unread until it is
 * answered; a new friendship is unread until the bell is opened after it.
 */
export function friendNotifications(
  overview: Pick<FriendOverview, "received" | "friends"> | null,
  seenAt: number,
  now: number,
): FriendNotification[] {
  if (!overview) return [];
  const oldest = now - NEW_FRIEND_DAYS * 24 * 60 * 60 * 1000;
  const requests: FriendNotification[] = overview.received.map((request) => ({
    kind: "request",
    key: `request:${request.requestId}`,
    requestId: request.requestId,
    displayName: request.displayName ?? "Someone",
    avatar: request.avatar,
    at: request.sentAt,
    unread: true,
  }));
  const friends: FriendNotification[] = overview.friends
    .filter((friend) => friend.since >= oldest)
    .map((friend) => ({
      kind: "friend",
      key: `friend:${friend.accountId}`,
      displayName: friend.displayName ?? "Someone",
      avatar: friend.avatar,
      at: friend.since,
      unread: friend.since > seenAt,
    }));
  return [...requests, ...friends].sort((a, b) => b.at - a.at);
}

/** "Just now", "5m", "3h", "2d" or "4w" since a moment. */
export function shortTimeAgo(at: number, now: number) {
  const minutes = Math.floor(Math.max(0, now - at) / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return `${Math.floor(days / 7)}w`;
}
