#!/usr/bin/env node
/** Unit tests for the customizable dashboard (Nov 2026): a layout over a kind's sections, a default and one's own, in rows. */
import { SECTIONS, cleanLayout, kindOf, layoutOf, resolveLayout, rowsOf } from "../../src/lib/dashboard-layout.js";

let failures = 0;
const check = (label, cond, detail = "") => {
  if (cond) console.log(`✓ ${label}`);
  else { console.error(`✗ ${label}${detail ? ` — ${detail}` : ""}`); failures++; }
};
const ids = (list) => list.map((s) => s.id).join(",");
const shape = (rows) => JSON.stringify(rows.map((r) => (r.full ? r.full.id : { l: r.left.map((s) => s.id), r: r.right.map((s) => s.id), c: r.cols })));

const first = resolveLayout("admin");
check("the first layout: SECTIONS' order", ids(first) === ids(SECTIONS.admin));
check("…the administrator's chart and recent on the left (wider), schedule and reps on the right",
  shape(rowsOf(first)) === JSON.stringify(["tiles", { l: ["chart", "recent"], r: ["schedule", "reps"], c: "2fr 1fr" }, "production", "calls"]), shape(rowsOf(first)));

const mine = resolveLayout("admin", null, { order: ["calls", "tiles"], hidden: ["reps"], collapsed: ["chart"], place: { schedule: "left", tiles: "nowhere" } });
check("one's own order; the sections it doesn't name back after the one they followed", ids(mine) === "calls,tiles,chart,recent,schedule,reps,production", ids(mine));
check("hidden, collapsed and placed as kept; a place not known ignored",
  mine.find((s) => s.id === "reps").hidden && mine.find((s) => s.id === "chart").collapsed && mine.find((s) => s.id === "schedule").place === "left" && mine.find((s) => s.id === "tiles").place === "full");
check("a column alone is full width; a hidden section left out", shape(rowsOf(mine)) === JSON.stringify(["calls", "tiles", { l: ["chart", "recent", "schedule"], r: [], c: null }, "production"]), shape(rowsOf(mine)));

const role = { order: ["tiles", "production", "chart", "recent", "schedule", "reps", "calls"], hidden: ["calls"], collapsed: [], place: {} };
check("the administrators' default, then one's own over it", resolveLayout("admin", role, null).find((s) => s.id === "calls").hidden
  && !resolveLayout("admin", role, { order: [], hidden: [], collapsed: [], place: {} }).find((s) => s.id === "calls").hidden);
check("…the default's order", ids(resolveLayout("admin", role, null)).startsWith("tiles,production,chart"), ids(resolveLayout("admin", role, null)));

check("kept: only the kind's sections, once each", JSON.stringify(cleanLayout("client", { order: ["tiles", "tiles", "chart", "activity"], hidden: "x", place: { tiles: "left", bad: "left" } }))
  === JSON.stringify({ order: ["tiles", "activity"], hidden: [], collapsed: [], place: { tiles: "left" } }));
const kept = resolveLayout("manager", null, { order: ["calls", "tiles", "production", "schedule", "developed", "team"], hidden: ["team"], collapsed: ["schedule"], place: { production: "full" } });
check("a layout round trip", JSON.stringify(resolveLayout("manager", null, layoutOf(kept))) === JSON.stringify(kept));
check("both columns wide: even", rowsOf(resolveLayout("client"))[1].cols === "1fr 1fr");
check("kinds by role", kindOf("admin") === "admin" && kindOf("manager") === "manager" && kindOf("agent") === "agent" && kindOf("client") === "client" && kindOf("client_agent") === "client");

if (failures) { console.error(`\n${failures} check(s) failed`); process.exit(1); }
console.log("\ndashboard layout: all passed");
