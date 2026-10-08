"use client";

import { useCallback, useEffect, useRef } from "react";
import { Textarea } from "@/components/ui/textarea";
import { useRole } from "@/components/layout/role-provider";
import { dropEmptyLine, noteStamp, withNewLine } from "@/lib/note-stamp";

/**
 * A notes box that keeps a trail: stepping into it begins a new line under
 * what is there, stamped with the day and who is writing ("10/8/26 seanf: "),
 * the cursor after it. A line begun and left empty goes again, when the box
 * is left and when its form is sent, so nothing is saved that says nothing.
 * Otherwise a plain Textarea (uncontrolled: `defaultValue`).
 */
export default function StampedTextarea({ ref, onFocus, onBlur, ...props }) {
  const { user, timeZone } = useRole();
  const own = useRef(null);
  const setRef = useCallback(
    (node) => {
      own.current = node;
      if (typeof ref === "function") ref(node);
      else if (ref) ref.current = node;
    },
    [ref]
  );
  const stamp = () => noteStamp(user, timeZone);

  // On sending, whatever reads the form (a server action, new FormData) gets the box without an empty line.
  useEffect(() => {
    const box = own.current;
    const form = box?.form;
    if (!form || !box.name) return;
    const clean = (e) => e.formData.set(box.name, dropEmptyLine(box.value, noteStamp(user, timeZone)).replace(/\s+$/, ""));
    form.addEventListener("formdata", clean);
    return () => form.removeEventListener("formdata", clean);
  }, [user, timeZone]);

  return (
    <Textarea
      ref={setRef}
      onFocus={(e) => {
        const box = e.currentTarget;
        const s = stamp();
        // Begun once: coming back to a line already started carries on with it.
        if (!box.value.replace(/\s+$/, "").endsWith(s)) box.value = withNewLine(box.value, s);
        const end = box.value.length;
        requestAnimationFrame(() => {
          box.setSelectionRange(end, end);
          box.scrollTop = box.scrollHeight;
        });
        onFocus?.(e);
      }}
      onBlur={(e) => {
        const box = e.currentTarget;
        box.value = dropEmptyLine(box.value, stamp());
        onBlur?.(e);
      }}
      {...props}
    />
  );
}
