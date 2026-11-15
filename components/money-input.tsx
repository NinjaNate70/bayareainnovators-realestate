"use client";
import { useState, type InputHTMLAttributes } from "react";

// The one dollar-amount field for the case flow. Typing replaces a leading 0
// (1500, not 01500), decimals can still be typed, the arrow keys move by $1,
// and the scroll wheel never changes the value.
export function MoneyInput({
  value,
  onValueChange,
  ...props
}: Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange" | "type" | "step" | "inputMode"
> & {
  value: number;
  onValueChange: (value: number) => void;
}) {
  // What the renter typed, kept so "1." and an emptied field aren't rewritten
  // under them. An outside change (such as charges filled in from the letter)
  // no longer matches the draft, so the new value is shown instead.
  const [draft, setDraft] = useState<string | null>(null);
  const shown =
    draft !== null && (Number(draft) || 0) === value ? draft : String(value);
  return (
    <input
      min="0"
      {...props}
      type="number"
      step="any"
      inputMode="decimal"
      value={shown}
      onFocus={(e) => {
        e.currentTarget.select();
        props.onFocus?.(e);
      }}
      onWheel={(e) => {
        e.currentTarget.blur();
        props.onWheel?.(e);
      }}
      onChange={(e) => {
        const typed = e.target.value.replace(/^0+(?=\d)/, "");
        setDraft(typed);
        const next = Number(typed);
        onValueChange(Number.isFinite(next) ? next : 0);
      }}
    />
  );
}
