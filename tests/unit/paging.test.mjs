#!/usr/bin/env node
/** Unit tests for list paging: a page's own default size (All Projects: 100; Sean, Nov 2026). */
import { PAGE_SIZE, pageInfo, readListParams } from "../../src/lib/paging.js";

let failures = 0;
const is = (label, got, want) => {
  if (JSON.stringify(got) === JSON.stringify(want)) console.log(`✓ ${label}`);
  else { console.error(`✗ ${label} — got ${JSON.stringify(got)}`); failures++; }
};

is("a list's size to begin with: 10", readListParams({}).perPage, PAGE_SIZE);
is("…a page's own default: 100", readListParams({}, [], { defaultPer: 100 }).perPage, 100);
is("…one chosen keeps to it", readListParams({ per: "10" }, [], { defaultPer: 100 }).perPage, 10);
is("…an odd size: the page's default", readListParams({ per: "7" }, [], { defaultPer: 100 }).perPage, 100);
is("the footer knows the page's default, to leave it out of the address", pageInfo(11, 1, 100, 100).defaultPer, 100);
is("…11 projects at 100: one page, 1–11", (({ pages, from, to }) => [pages, from, to])(pageInfo(11, 1, 100, 100)), [1, 1, 11]);

if (failures) {
  console.error(`\n${failures} paging check(s) failed`);
  process.exit(1);
}
console.log("\nAll paging checks passed.");
