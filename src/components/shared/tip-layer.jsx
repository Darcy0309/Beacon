"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const GAP = 8; // between the tip and what it points at
const EDGE = 8; // kept clear of the window's edges

/**
 * Tooltips in the app's own style, never the browser's: anything inside
 * with `data-tip="key"` shows `tips[key]` above it while the pointer is on
 * it, or while it (or something in it) has keyboard focus.
 *
 *   tips[key]  a sentence, or { title, rows: [{ key, label, value, share,
 *              color }], total, foot } for a chart
 *   data-tip-anchor   inside the target: the part the tip points at (the
 *                     top of a bar); otherwise the target itself
 *   data-tip-row      on the part under the pointer: lights that row
 *
 * The tip opens above, centred, and is kept inside the window (below, if
 * there is no room above). It sits over the page, so a card's edge never
 * cuts it off. `delay` holds it back, for tips that would otherwise pop up
 * on every pass of the pointer.
 */
export default function TipLayer({ tips, delay = 0, className, children, ...rest }) {
  const wrapRef = useRef(null);
  const tipRef = useRef(null);
  const timer = useRef(null);
  const [shown, setShown] = useState(null); // { key, row, x, top, bottom }
  const [place, setPlace] = useState(null); // { left, top }

  const hide = useCallback(() => {
    clearTimeout(timer.current);
    setShown(null);
    setPlace(null);
  }, []);

  const show = useCallback((el) => {
    const target = el instanceof Element ? el.closest("[data-tip]") : null;
    if (!target || !wrapRef.current?.contains(target) || !tips?.[target.getAttribute("data-tip")]) return hide();
    const anchor = target.querySelector("[data-tip-anchor]") ?? target;
    const r = anchor.getBoundingClientRect();
    const next = {
      key: target.getAttribute("data-tip"),
      row: el.closest("[data-tip-row]")?.getAttribute("data-tip-row") ?? null,
      x: r.left + r.width / 2,
      top: r.top,
      bottom: r.bottom,
    };
    clearTimeout(timer.current);
    const open = () => setShown((now) => (now && now.key === next.key && now.row === next.row ? now : next));
    if (delay) timer.current = setTimeout(open, delay);
    else open();
  }, [tips, delay, hide]);

  // Placed once its size is known: above, centred, inside the window.
  useLayoutEffect(() => {
    if (!shown || !tipRef.current) return;
    // The layout size: the opening animation scales the tip, and a scaled
    // measurement would place it off-centre once the animation ends.
    const width = tipRef.current.offsetWidth;
    const height = tipRef.current.offsetHeight;
    const left = Math.min(Math.max(shown.x - width / 2, EDGE), window.innerWidth - width - EDGE);
    const above = shown.top - GAP - height;
    const top = above >= EDGE ? above : Math.min(shown.bottom + GAP, window.innerHeight - height - EDGE);
    setPlace({ left, top });
  }, [shown]);

  // A scroll moves what it points at: let it go.
  useEffect(() => {
    if (!shown) return undefined;
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    return () => {
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
    };
  }, [shown, hide]);

  useEffect(() => () => clearTimeout(timer.current), []);

  const tip = shown ? tips?.[shown.key] : null;

  return (
    <div
      {...rest}
      ref={wrapRef}
      className={className}
      // A tap on a phone opens what it was tapped on; the tip is for a mouse.
      onPointerOver={(e) => (e.pointerType === "touch" ? null : show(e.target))}
      onPointerLeave={hide}
      onFocus={(e) => show(e.target)}
      onBlur={hide}
    >
      {children}
      {tip && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={tipRef}
              role="tooltip"
              data-tip-open={shown.key}
              className="animate-popover-in pointer-events-none fixed z-[60] w-max max-w-72 rounded-md border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-lg"
              style={{ left: place?.left ?? 0, top: place?.top ?? 0, visibility: place ? "visible" : "hidden" }}
            >
              <TipBody tip={tip} row={shown.row} />
            </div>,
            document.body
          )
        : null}
    </div>
  );
}

function TipBody({ tip, row }) {
  if (typeof tip === "string") return <p className="leading-relaxed">{tip}</p>;
  return (
    <>
      {tip.title ? <div className="mb-1.5 font-semibold">{tip.title}</div> : null}
      {tip.rows?.length ? (
        <div className="space-y-0.5">
          {tip.rows.map((r) => (
            <div key={r.key} data-tip-line={r.key}
              className={`-mx-1.5 flex items-center gap-2 rounded px-1.5 py-0.5 ${row === r.key ? "bg-foreground/10" : ""}`}>
              {r.color ? <span className="size-2 shrink-0 rounded-full" style={{ background: r.color }} /> : null}
              <span className="flex-1 text-muted-foreground">{r.label}</span>
              <span className="font-semibold tabular-nums">{r.value}</span>
              {r.share != null ? <span className="w-9 text-right tabular-nums text-muted-foreground">{r.share}</span> : null}
            </div>
          ))}
        </div>
      ) : null}
      {tip.total != null ? (
        <div className="mt-1.5 flex items-center justify-between gap-6 border-t border-[var(--panel-border)] pt-1.5 font-semibold">
          <span>Total</span>
          <span className="tabular-nums">{tip.total}</span>
        </div>
      ) : null}
      {tip.foot ? <div className="mt-1 text-[0.62rem] text-muted-foreground">{tip.foot}</div> : null}
    </>
  );
}
