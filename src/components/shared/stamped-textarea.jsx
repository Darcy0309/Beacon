"use client";

import { useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";
import MicButton from "@/components/shared/mic-button";
import { useRole } from "@/components/layout/role-provider";
import { dropEmptyLine, noteStamp, withNewLine } from "@/lib/note-stamp";
import { useDictation } from "@/lib/use-dictation";
import { cn } from "@/lib/utils";

/**
 * A notes box that keeps a trail: stepping into it begins a new line under
 * what is there, stamped with the day and who is writing ("10/8/26 seanf: "),
 * the cursor after it. A line begun and left empty goes again, when the box
 * is left and when its form is sent, so nothing is saved that says nothing.
 * Otherwise a plain Textarea (uncontrolled: `defaultValue`).
 *
 * `dictation`: a microphone in its corner, to talk to type (Sean, Nov 2026; where the browser can):
 * what is said goes in where the cursor is, after the day's stamp, as it is heard.
 */
export default function StampedTextarea({ ref, onFocus, onBlur, dictation = false, className, ...props }) {
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
  const talk = useDictation({ onError: (message) => toast.error(message) });

  // Talking to type: into the box, at the cursor (after its stamp), what is said so far replacing what was heard before.
  const toggleTalk = () => {
    const box = own.current;
    if (!box) return;
    if (talk.listening) return talk.stop();
    const go = () => {
      const before = box.value.slice(0, box.selectionStart);
      const after = box.value.slice(box.selectionEnd);
      const gap = before && !/\s$/.test(before) ? " " : "";
      talk.start((text) => {
        const head = `${before}${gap}${text}`;
        box.value = `${head}${after}`;
        box.setSelectionRange(head.length, head.length);
        box.scrollTop = box.scrollHeight;
      });
    };
    // Not yet in the box: stepped into first, so its line is stamped and the cursor after it.
    if (document.activeElement !== box) {
      box.focus();
      requestAnimationFrame(() => requestAnimationFrame(go));
    } else go();
  };

  // On sending, whatever reads the form (a server action, new FormData) gets the box without an empty line.
  // The box as it is when sent (own.current), never one held from before: a box drawn again (as when its
  // microphone came) must not send what the old one had (Nov 2026: a note saved empty).
  useEffect(() => {
    const form = own.current?.form;
    if (!form || !own.current.name) return;
    const clean = (e) => {
      const box = own.current;
      if (!box?.name || box.form !== form) return;
      e.formData.set(box.name, dropEmptyLine(box.value, noteStamp(user, timeZone)).replace(/\s+$/, ""));
    };
    form.addEventListener("formdata", clean);
    return () => form.removeEventListener("formdata", clean);
  }, [user, timeZone]);

  const field = (
    <Textarea
      ref={setRef}
      className={cn(dictation && "pr-11", className)}
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
        // Talking stops when the box is left (the stamp line, if empty, is gone with it).
        if (talk.listening) talk.stop();
        onBlur?.(e);
      }}
      {...props}
    />
  );
  if (!dictation) return field;
  // The same box from the first draw: only the microphone comes once the browser is known to hear.
  return (
    <div className="relative">
      {field}
      {talk.supported ? <MicButton listening={talk.listening} onToggle={toggleTalk} className="absolute bottom-2 right-2" /> : null}
    </div>
  );
}
