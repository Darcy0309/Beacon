#!/usr/bin/env node
/** Unit tests for kept files: which a browser shows itself, and where one opens or is downloaded. */
import { extensionOf, fileHref, fileKind } from "../../src/lib/files.js";

let failures = 0;
const check = (label, cond, detail = "") => {
  if (cond) console.log(`✓ ${label}`);
  else { console.error(`✗ ${label}${detail ? ` — ${detail}` : ""}`); failures++; }
};
const is = (label, got, want) => check(label, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}`);

is("a file's extension, from its name", ["Dec page.PDF", "photo.jpeg", "no extension", " notes.txt ", null].map(extensionOf), ["PDF", "JPEG", null, "TXT", null]);
is("PDFs, pictures and plain text show in the browser", ["policy.pdf", "front.JPG", "roof.png", "scan.webp", "notes.txt"].map((n) => fileKind(n)), ["pdf", "image", "image", "image", "text"]);
is("…the kept file type decides when there is one", [fileKind("export", "PDF"), fileKind("odd.bin", "png")], ["pdf", "image"]);
is("Word, Excel, emails and SVG pictures (which can run script) are downloaded", ["quote.docx", "loss runs.xlsx", "reply.msg", "logo.svg", "archive.zip", "noext"].map((n) => fileKind(n)), [null, null, null, null, null, null]);
is("where one opens, or is downloaded", [fileHref(42), fileHref(42, { download: true })], ["/api/files/42", "/api/files/42?download=1"]);

console.log(failures ? `\n${failures} file check(s) failed.\n` : "\nAll file checks passed.\n");
process.exit(failures ? 1 : 0);
