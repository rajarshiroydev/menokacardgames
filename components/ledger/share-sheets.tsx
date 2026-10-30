"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import qrcode from "qrcode-generator";
import { formatUserCode } from "@/lib/accounts/identity-code";
import { INVITE_EXPIRY_DAYS, inviteMessage, invitePath } from "@/lib/friends/invites";
import { parseCodeInput } from "@/lib/friends/requests";
import { apiErrorMessage } from "@/lib/security/rate-limit-message";

/** QR code as SVG squares, so no generated markup is injected. */
function QrCode({ text, label }: { text: string; label: string }) {
  const path = useMemo(() => {
    const code = qrcode(0, "M");
    code.addData(text);
    code.make();
    const size = code.getModuleCount();
    let d = "";
    for (let row = 0; row < size; row += 1) {
      for (let col = 0; col < size; col += 1) {
        if (code.isDark(row, col)) d += `M${col + 4} ${row + 4}h1v1h-1z`;
      }
    }
    return { d, size: size + 8 };
  }, [text]);
  return (
    <svg
      className="live-qr"
      viewBox={`0 0 ${path.size} ${path.size}`}
      role="img"
      aria-label={label}
      shapeRendering="crispEdges"
    >
      <rect width={path.size} height={path.size} fill="#fff" />
      <path d={path.d} fill="#000" />
    </svg>
  );
}

export const QR_ICON = (
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
    <rect x="4" y="4" width="6" height="6" rx="1" />
    <rect x="14" y="4" width="6" height="6" rx="1" />
    <rect x="4" y="14" width="6" height="6" rx="1" />
    <path d="M14 14h3v3M20 14v.01M14 20h.01M17 20h3v-3" />
  </svg>
);

export const SCAN_ICON = (
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
    <path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16M4 12h16" />
  </svg>
);

type ScannerStatus = "starting" | "scanning" | "blocked" | "unavailable";

/**
 * Reads a user code from the camera. Frames are decoded with jsQR, loaded
 * only when scanning, so it works the same on iPhones, which have no
 * BarcodeDetector. Other QR codes (a live standings link, say) are skipped
 * with a note and scanning carries on.
 */
export function QrScanner({ onCode }: { onCode: (code: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const onCodeRef = useRef(onCode);
  const [status, setStatus] = useState<ScannerStatus>("starting");
  const [otherCode, setOtherCode] = useState(false);

  useEffect(() => {
    onCodeRef.current = onCode;
  }, [onCode]);

  useEffect(() => {
    let stopped = false;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    function stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      stream?.getTracks().forEach((track) => track.stop());
    }

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus("unavailable");
        return;
      }
      try {
        const [media, { default: jsQR }] = await Promise.all([
          navigator.mediaDevices.getUserMedia({
            video: { facingMode: "environment" },
            audio: false,
          }),
          import("jsqr"),
        ]);
        stream = media;
        const video = videoRef.current;
        if (stopped || !video) {
          stop();
          return;
        }
        video.srcObject = media;
        await video.play();
        if (stopped) return;
        setStatus("scanning");

        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d", { willReadFrequently: true });
        const scan = () => {
          if (stopped || !context) return;
          if (video.videoWidth) {
            // Phones film at 1080p or more; 640px is plenty for a code
            // held up close and keeps each decode quick.
            const scale = Math.min(
              1,
              640 / Math.max(video.videoWidth, video.videoHeight),
            );
            const width = Math.round(video.videoWidth * scale);
            const height = Math.round(video.videoHeight * scale);
            canvas.width = width;
            canvas.height = height;
            context.drawImage(video, 0, 0, width, height);
            const frame = context.getImageData(0, 0, width, height);
            const found = jsQR(frame.data, width, height, {
              inversionAttempts: "dontInvert",
            });
            if (found) {
              const parsed = parseCodeInput(found.data);
              if (parsed?.kind === "user") {
                stop();
                onCodeRef.current(parsed.code);
                return;
              }
              setOtherCode(true);
            }
          }
          timer = setTimeout(scan, 150);
        };
        scan();
      } catch (error) {
        if (stopped) return;
        stop();
        setStatus(
          error instanceof DOMException &&
            (error.name === "NotAllowedError" || error.name === "SecurityError")
            ? "blocked"
            : "unavailable",
        );
      }
    }

    void start();
    return stop;
  }, []);

  const note: Record<ScannerStatus, string> = {
    starting: "Starting the camera…",
    scanning: otherCode
      ? "That QR code isn't a user code. Point the camera at theirs."
      : "Point the camera at their code. It's on their Profile, under the QR button.",
    blocked:
      "Camera access is off. Allow it for this site in your browser settings, or type their code.",
    unavailable: "The camera isn't available here. Type their code instead.",
  };
  const failed = status === "blocked" || status === "unavailable";

  return (
    <div className="qr-scanner">
      {failed ? null : (
        <div className="qr-scanner-view">
          <video ref={videoRef} muted playsInline aria-label="Camera view" />
          <span className="qr-scanner-frame" aria-hidden="true" />
        </div>
      )}
      <p className={failed ? "field-error" : "muted small-note"} role="status">
        {note[status]}
      </p>
    </div>
  );
}

/** Your user code as a QR for a friend to scan, or the camera to scan theirs. */
export function UserCodeSheet({
  userCode,
  onScanned,
  onClose,
}: {
  userCode: string;
  onScanned: (code: string) => void;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<"mine" | "scan">("mine");

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

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
        aria-labelledby="user-code-title"
      >
        <span className="sheet-grabber" aria-hidden="true" />
        <h2 id="user-code-title">User code</h2>
        <div className="profile-modes" role="group" aria-label="Show or scan">
          {(
            [
              ["mine", "My Code"],
              ["scan", "Scan Code"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={mode === key ? "selected" : ""}
              aria-pressed={mode === key}
              onClick={() => setMode(key)}
            >
              {label}
            </button>
          ))}
        </div>
        {mode === "mine" ? (
          <>
            <p className="muted small-note">
              A friend scans this with Scan Code in the app to send you a
              friend request.
            </p>
            <QrCode
              text={formatUserCode(userCode)}
              label="QR code for your user code"
            />
            <p className="user-code-text">{formatUserCode(userCode)}</p>
          </>
        ) : (
          <QrScanner onCode={onScanned} />
        )}
      </div>
    </div>
  );
}

/**
 * Invite to Pokerize, for one of your own guests (migration 0030; user
 * decisions 2026-10-26: only the host who added a guest can invite them,
 * never a friend's guest). Makes a one-person link, which works once for
 * 30 days, and shares it. Whoever opens it, signs in and confirms they're
 * the guest becomes your friend, with the guest's games.
 */
export function InviteSheet({
  guest,
  hostName,
  onToast,
  onClose,
}: {
  guest: { id: string; name: string };
  hostName: string;
  onToast: (message: string) => void;
  onClose: () => void;
}) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const canShare = typeof navigator !== "undefined" && "share" in navigator;
  const message = inviteMessage(hostName, guest.name);

  async function create() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create", playerId: guest.id }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        token?: string;
        error?: string;
      };
      if (!response.ok || !data.token) {
        throw new Error(
          apiErrorMessage(response.status, data.error, "Could not make the invite"),
        );
      }
      setUrl(`${window.location.origin}${invitePath(data.token)}`);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not make the invite");
    } finally {
      setBusy(false);
    }
  }

  async function share() {
    try {
      await navigator.share({ title: "Join me on Pokerize", text: message, url });
    } catch {
      // The host closed the share sheet.
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(`${message} ${url}`);
      onToast("Invite Copied");
    } catch {
      // Clipboard blocked: the link is still shown for copying by hand.
    }
  }

  return (
    <div
      className="modal show"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="sheet live-share-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="invite-title"
      >
        <span className="sheet-grabber" aria-hidden="true" />
        <h2 id="invite-title">Invite to Pokerize</h2>
        <p className="muted rule-note">
          Send <span className="literal-text">{guest.name}</span> a link to
          join. Once they sign in and confirm it&apos;s them, you become
          friends and every game they played as{" "}
          <span className="literal-text">{guest.name}</span> moves to their
          account. The link works once, for {INVITE_EXPIRY_DAYS} days; a new
          link replaces the last one.
        </p>
        {url ? (
          <>
            <p className="live-link">{url}</p>
            {canShare ? (
              <button className="primary full" type="button" onClick={() => void share()}>
                Share invite
              </button>
            ) : null}
            <button
              className={`${canShare ? "ghost" : "primary"} full`}
              type="button"
              onClick={() => void copy()}
            >
              Copy invite
            </button>
          </>
        ) : (
          <button
            className="primary full"
            type="button"
            disabled={busy}
            onClick={() => void create()}
          >
            {busy ? "Making link…" : "Make invite link"}
          </button>
        )}
        {error ? (
          <p className="field-error" role="alert">
            {error}
          </p>
        ) : null}
        <button className="ghost full" type="button" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}

export function LiveShareSheet({
  token,
  busy,
  failing,
  onStart,
  onStop,
  onCopied,
  onClose,
}: {
  token: string | null;
  busy: boolean;
  failing: boolean;
  onStart: () => void;
  onStop: () => void;
  onCopied: () => void;
  onClose: () => void;
}) {
  const url = token ? `${window.location.origin}/live/${token}` : "";
  const canShare = typeof navigator !== "undefined" && "share" in navigator;

  async function share() {
    try {
      await navigator.share({ title: "Live standings", url });
    } catch {
      // The host closed the share sheet.
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      onCopied();
    } catch {
      // Clipboard blocked: the link is still shown for copying by hand.
    }
  }

  return (
    <div
      className="modal show"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="sheet live-share-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="live-share-title"
      >
        <h2 id="live-share-title">Live Standings</h2>
        {token ? (
          <>
            <p className="muted rule-note">
              Players scan this or open the link to see every stack and this
              game&apos;s standings on their own phones. It updates a few
              seconds after each change and ends when you save or discard the
              game.
            </p>
            <QrCode text={url} label="QR code for the live standings link" />
            <p className="live-link">{url}</p>
            {failing ? (
              <p className="field-error">
                The live link isn&apos;t updating. It will retry after the next
                change.
              </p>
            ) : null}
            {canShare ? (
              <button className="primary full" type="button" onClick={() => void share()}>
                Share link
              </button>
            ) : null}
            <button
              className={`${canShare ? "ghost" : "primary"} full`}
              type="button"
              onClick={() => void copy()}
            >
              Copy link
            </button>
            <button
              className="ghost full danger-text"
              type="button"
              disabled={busy}
              onClick={onStop}
            >
              Stop sharing
            </button>
          </>
        ) : (
          <>
            <p className="muted rule-note">
              Create a link players can open without signing in. They see each
              player&apos;s stack, total bought in and net for this game only,
              read-only. Anyone with the link can see it until the game is
              saved or discarded, or you stop sharing.
            </p>
            <button
              className="primary full"
              type="button"
              disabled={busy}
              onClick={onStart}
            >
              {busy ? "Creating link…" : "Create live link"}
            </button>
          </>
        )}
        <button className="ghost full" type="button" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
