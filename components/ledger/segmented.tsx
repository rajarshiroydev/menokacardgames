"use client";

import { ReactNode } from "react";

export function Segmented<T extends string | number>({
  label,
  options,
  value,
  onChange,
  columns,
}: {
  label: string;
  /** With `icon`, the chip shows the icon and `label` becomes its accessible name. */
  options: ReadonlyArray<{ value: T; label: string; icon?: ReactNode }>;
  value: T;
  onChange: (value: T) => void;
  /** Wrap into rows of this many equal chips instead of one row. */
  columns?: number;
}) {
  return (
    <div
      className={columns ? "segmented grid" : "segmented"}
      style={columns ? { gridTemplateColumns: `repeat(${columns}, 1fr)` } : undefined}
      role="radiogroup"
      aria-label={label}
    >
      {options.map((option) => (
        <button
          key={String(option.value)}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          className={option.value === value ? "selected" : ""}
          aria-label={option.icon ? option.label : undefined}
          onClick={() => onChange(option.value)}
        >
          {option.icon ?? option.label}
        </button>
      ))}
    </div>
  );
}
