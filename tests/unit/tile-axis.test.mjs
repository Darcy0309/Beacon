#!/usr/bin/env node
/** Unit tests for the tile charts' foot (lib/tile-axis.js; client, Nov 2026). */
import assert from "node:assert/strict";
import { dayAxis, hourAxis } from "../../src/lib/tile-axis.js";

const week = ["2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13", "2026-11-14", "2026-11-15"];
assert.deepEqual(dayAxis(week).labels, ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"], "a week: its days");
assert.equal(dayAxis(week).titles[0], "Mon, Nov 9");
const month = Array.from({ length: 30 }, (_, i) => `2026-11-${String(i + 1).padStart(2, "0")}`);
assert.deepEqual(dayAxis(month).labels.slice(0, 3).concat(dayAxis(month).labels.slice(-1)), ["1", "2", "3", "30"], "a month: its dates");
const pay = Array.from({ length: 14 }, (_, i) => `2026-11-${String(i + 16).padStart(2, "0")}`);
assert.deepEqual([dayAxis(pay).labels[0], dayAxis(pay).labels[13]], ["16", "29"], "a pay period: its dates");

const day = hourAxis({ 9: 2, 14: 1 });
assert.deepEqual(day.labels, ["8a", "9a", "10a", "11a", "12p", "1p", "2p", "3p", "4p", "5p", "6p"], "a day: the working hours");
assert.deepEqual([day.series[1], day.series[6], day.titles[4]], [2, 1, "12 PM"]);
const late = hourAxis({ 6: 1, 21: 3 });
assert.deepEqual([late.labels[0], late.labels.at(-1), late.series[0], late.series.at(-1)], ["6a", "9p", 1, 3], "widened to the hours with something in them");
console.log("tile axis: ok");
