"use client";

import { useId, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { carrierKey, suggestCarriers } from "@/lib/coverage";
import { cn } from "@/lib/utils";

/**
 * A text field that suggests names from a list as someone types (a carrier
 * on the Coverage tab): names starting with what was typed first, then
 * names with a word that does, then names containing it. Arrow keys move
 * through them, Enter or a click takes one. A name not on the list can
 * still be typed; the field says so, so the list can grow instead of
 * collecting spellings. Submits as an ordinary input called `name`.
 *
 * The list opens under the field, in the page's flow, so a dialog's
 * scrolling never cuts it off. `value`/`onChange` to control it (a value
 * filled in from elsewhere); `defaultValue` otherwise.
 */
export default function SuggestInput({ name, value: controlled, defaultValue = "", onChange, options, placeholder, invalid, id, "aria-label": ariaLabel, className }) {
  const [own, setOwn] = useState(defaultValue ?? "");
  const value = controlled !== undefined ? controlled ?? "" : own;
  const setValue = (v) => {
    if (controlled === undefined) setOwn(v);
    onChange?.(v);
  };
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();

  const matches = useMemo(() => (open ? suggestCarriers(options, value) : []), [open, options, value]);
  const known = useMemo(() => !value.trim() || options.some((o) => carrierKey(o) === carrierKey(value)), [options, value]);
  const showing = open && matches.length > 0 && !(matches.length === 1 && carrierKey(matches[0]) === carrierKey(value));

  const take = (picked) => {
    setValue(picked);
    setOpen(false);
  };

  const onKeyDown = (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) setOpen(true);
      const n = matches.length || 1;
      setActive((a) => (e.key === "ArrowDown" ? (a + 1) % n : (a - 1 + n) % n));
    } else if (e.key === "Enter" && showing) {
      e.preventDefault();
      take(matches[Math.min(active, matches.length - 1)]);
    } else if (e.key === "Escape" && showing) {
      setOpen(false);
    }
  };

  return (
    <div className={cn("min-w-0", className)} data-suggest={name}>
      <Input
        id={id}
        name={name}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onFocus={() => value && setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        maxLength={120}
        autoComplete="off"
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={showing}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showing ? `${listId}-${active}` : undefined}
        aria-invalid={invalid}
      />
      {showing ? (
        <ul id={listId} role="listbox" className="mt-1 max-h-48 overflow-y-auto rounded-md border bg-popover p-1 text-sm text-popover-foreground shadow-md">
          {matches.map((m, i) => (
            <li
              key={m}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              data-suggestion={m}
              // Before the field's blur closes the list.
              onMouseDown={(e) => {
                e.preventDefault();
                take(m);
              }}
              onMouseEnter={() => setActive(i)}
              className={cn("cursor-pointer rounded-sm px-2 py-1.5", i === active && "bg-primary/15 text-primary")}
            >
              {m}
            </li>
          ))}
        </ul>
      ) : !known && !open ? (
        <p data-not-listed className="mt-1 text-[0.7rem] text-amber-600 dark:text-amber-400">Not in the carrier list: check the spelling.</p>
      ) : null}
    </div>
  );
}
