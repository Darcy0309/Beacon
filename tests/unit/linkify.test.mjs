import assert from "node:assert/strict";
import { linkParts } from "../../src/lib/linkify.js";

const links = (t) => linkParts(t).filter((p) => p.href).map((p) => `${p.internal ? "in" : "out"}:${p.href}`);

// A web address, its sentence's full stop left out of it.
assert.deepEqual(links("See https://beacon-rosy-eta.vercel.app/projects/14."), ["out:https://beacon-rosy-eta.vercel.app/projects/14"]);
// A Lighthouse page written as its path.
assert.deepEqual(links("Open /leads/123 and /projects/14, then call."), ["in:/leads/123", "in:/projects/14"]);
assert.deepEqual(links("/calendar"), ["in:/calendar"]);
// Not a page: a date, a fraction, a path in the middle of a word, an unknown section.
assert.deepEqual(links("Due 10/28 or 1/2 of them, and/or a/leads/1, /nowhere/1"), []);
// The text around them kept as written.
assert.equal(linkParts("Go to /leads/9 now").map((p) => p.text ?? p.href).join(""), "Go to /leads/9 now");
console.log("linkify: ok");
