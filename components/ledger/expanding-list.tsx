"use client";

import { ReactNode, useRef, useState } from "react";

/** Items shown before the first press, and added by each press. */
const LIST_START = 5;
const LIST_STEP = 10;

/**
 * Shows the first items of a long list, with buttons under the last visible
 * item to add 10 more or show the rest at once; once everything is shown,
 * one button collapses the list back.
 */
export function ExpandingList<T>({
  items,
  render,
  more,
  all,
  className,
}: {
  items: T[];
  render: (item: T) => ReactNode;
  more: (count: number) => string;
  all: string;
  className?: string;
}) {
  const [shown, setShown] = useState(LIST_START);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const visible = items.slice(0, shown).map(render);
  const remaining = items.length - shown;

  function collapse() {
    setShown(LIST_START);
    // Collapsing leaves the page scrolled far below the short list.
    requestAnimationFrame(() =>
      buttonRef.current?.scrollIntoView({ block: "nearest" }),
    );
  }

  return (
    <>
      {className ? <div className={className}>{visible}</div> : visible}
      {items.length > LIST_START ? (
        <div className="history-expander">
          {remaining > 0 ? (
            <>
              <button
                type="button"
                className="expander-button"
                onClick={() => setShown(shown + LIST_STEP)}
              >
                {more(Math.min(LIST_STEP, remaining))}
              </button>
              {/* With 10 or fewer left, "more" already shows them all. */}
              {remaining > LIST_STEP ? (
                <button
                  type="button"
                  className="expander-button"
                  onClick={() => setShown(items.length)}
                >
                  {all}
                  <small>{remaining} left</small>
                </button>
              ) : null}
            </>
          ) : (
            <button
              ref={buttonRef}
              type="button"
              className="expander-button open"
              onClick={collapse}
            >
              Show fewer
            </button>
          )}
        </div>
      ) : null}
    </>
  );
}
