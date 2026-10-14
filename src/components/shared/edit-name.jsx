"use client";

import { useRef, useState } from "react";
import { RowEditContext } from "@/components/shared/row-edit-context";
import { cn } from "@/lib/utils";

/**
 * A record's name in a list, for a record with no page of its own (a user,
 * an insurance company): clicking it opens the record's form, as Edit in the
 * row's ⋯ menu does. `edit`: the same form element the menu is given.
 */
export default function EditName({ name, edit, className, ...rest }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const returnFocus = (event) => {
    event.preventDefault();
    ref.current?.focus();
  };
  return (
    <>
      <button ref={ref} type="button" onClick={() => setOpen(true)} {...rest}
        className={cn("cursor-pointer text-left font-medium transition-colors hover:text-primary hover:underline", className)}>
        {name}
      </button>
      <RowEditContext.Provider value={{ open, setOpen, returnFocus }}>{edit}</RowEditContext.Provider>
    </>
  );
}
