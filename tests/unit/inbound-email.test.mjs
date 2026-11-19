#!/usr/bin/env node
/** Unit tests for email replies to a lead's email (Nov 2026): the reply address, the reply's own words, Resend's signature. */
import { createHmac } from "node:crypto";
import { htmlText, parseMailbox, replyAddress, replyText, replyToken, verifySvix } from "../../src/lib/inbound-email.js";

let failures = 0;
const check = (label, cond, detail = "") => {
  if (cond) console.log(`✓ ${label}`);
  else { console.error(`✗ ${label}${detail ? ` — ${detail}` : ""}`); failures++; }
};

const token = "a3f9c2d4e5b6a7c8d9e0f1a2b3c4d5e6";
check("a reply address", replyAddress(token, "reply.example.net") === `reply-${token}@reply.example.net`);
check("…its token read back, from any of the addresses, named or not", replyToken(["someone@else.com", `Sean <reply-${token}@reply.example.net>`]) === token);
check("…none from other addresses", replyToken(["reply-short@x.com", "dana@x.com"]) === null && replyToken([]) === null);

const gmail = "Sounds good, call me Friday.\n\nThanks,\nDana\n\nOn Tue, Nov 18, 2026 at 3:31 PM Sean Fipps <reply-x@reply.example.net> wrote:\n> Hi Dana,\n> Here is the list.";
check("a reply's own words: Gmail's quote cut off", replyText(gmail) === "Sounds good, call me Friday.\n\nThanks,\nDana", JSON.stringify(replyText(gmail)));
const outlook = "Friday works.\r\n\r\nFrom: Sean Fipps <reply-x@reply.example.net>\r\nSent: Tuesday, November 18, 2026 3:31 PM\r\nTo: Dana\r\nSubject: Quote";
check("…Outlook's", replyText(outlook) === "Friday works.", JSON.stringify(replyText(outlook)));
check("…quoted lines at the end", replyText("Yes please\n> earlier\n> more") === "Yes please");
check("…all of it when nothing else is said", replyText("> only a quote") === "> only a quote");
check("plain text from HTML", htmlText("<div>Hi&nbsp;Sean,<br>Friday<b> at 10</b></div><p>Dana &amp; Co</p>") === "Hi Sean,\nFriday at 10\nDana & Co");
check("a mailbox read", JSON.stringify(parseMailbox('"Dana Reyes" <Dana@X.com>')) === JSON.stringify({ name: "Dana Reyes", address: "dana@x.com" }) && parseMailbox("dana@x.com").address === "dana@x.com");

const secretBytes = Buffer.from("lighthouse-test-secret-0123456789");
const secret = `whsec_${secretBytes.toString("base64")}`;
const body = JSON.stringify({ type: "email.received", data: { email_id: "e1" } });
const now = 1_800_000_000;
const sign = (b, id, ts) => `v1,${createHmac("sha256", secretBytes).update(`${id}.${ts}.${b}`).digest("base64")}`;
const headers = { id: "msg_1", timestamp: String(now), signature: `v1,bogus ${sign(body, "msg_1", now)}` };
check("Resend's signature: a signed webhook passes", verifySvix(body, headers, secret, now));
check("…a body changed on the way does not", !verifySvix(body.replace("e1", "e2"), headers, secret, now));
check("…nor another secret", !verifySvix(body, headers, `whsec_${Buffer.from("other").toString("base64")}`, now));
check("…nor one sent over five minutes ago", !verifySvix(body, headers, secret, now + 301));
check("…nor a missing signature", !verifySvix(body, { ...headers, signature: "" }, secret, now) && !verifySvix(body, headers, "", now));

if (failures) {
  console.error(`\n${failures} failed`);
  process.exit(1);
}
console.log("\ninbound email: all passed");
