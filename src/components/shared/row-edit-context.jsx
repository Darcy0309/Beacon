"use client";

import { createContext, useContext, useState } from "react";

/**
 * Lets a row's action menu open a record form that lives outside the menu.
 *
 * A dialog rendered inside a dropdown item unmounts the moment the menu
 * closes, so RowActions renders the form beside the menu instead and drives
 * it through this context. A form that finds the context uses it as its
 * open state, hides its own trigger, and on close hands focus back to the
 * row's ⋯ button; without the context it behaves as before, with its own
 * button.
 */
export const RowEditContext = createContext(null);

/**
 * Open state for a record form: the row's, when inside a row menu, else its own.
 * Returns [open, setOpen, inRowMenu, onCloseAutoFocus]; pass the last one to
 * the form's DialogContent (it is undefined outside a row menu).
 */
export function useDialogOpen() {
  const row = useContext(RowEditContext);
  const [own, setOwn] = useState(false);
  return row ? [row.open, row.setOpen, true, row.returnFocus] : [own, setOwn, false, undefined];
}
