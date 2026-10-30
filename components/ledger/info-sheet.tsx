"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";

/**
 * The sheet an "i" button opens: closes with Got it, a tap outside it or the
 * Escape key. It renders into the page body because the glass cards that hold
 * the "i" buttons blur their backdrop, which would otherwise pin the sheet
 * inside the card instead of the bottom of the screen.
 */
export function InfoSheet({
  label,
  onClose,
  children,
}: {
  label: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return createPortal(
    <div
      className="modal show"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="sheet info-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={label}
      >
        {children}
        <button className="primary" type="button" onClick={onClose}>
          Got it
        </button>
      </div>
    </div>,
    document.body,
  );
}
