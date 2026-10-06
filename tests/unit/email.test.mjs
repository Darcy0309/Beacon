#!/usr/bin/env node
/**
 * Unit tests for emailing a name's contact: an email goes to exactly one
 * plain address, its subject stays on one line, and a failed send is
 * explained in words the sender can act on.
 */
import { EMAIL_LIMITS, isMailbox, mailFailure, mailboxHeader, oneLine, resendFailure } from "../../src/lib/email.js";
import { schemas, validate } from "../../src/lib/validate.js";

let failures = 0;
const check = (label, cond, detail = "") => {
  if (cond) console.log(`✓ ${label}`);
  else { console.error(`✗ ${label}${detail ? ` — ${detail}` : ""}`); failures++; }
};

// --- one plain address --------------------------------------------------------
for (const ok of ["dana@capitalins.com", "dana.whitfield+leads@mail.capital-ins.co.uk", "o'brien@shop.us", "D@X.IO"]) {
  check(`one address: ${ok}`, isMailbox(ok));
}
for (const [bad, why] of [
  ["dana@capitalins.com, boss@capitalins.com", "two addresses"],
  ["dana@capitalins.com;boss@capitalins.com", "two addresses with ;"],
  ["Dana <dana@capitalins.com>", "a name and angle brackets"],
  ["<dana@capitalins.com>", "angle brackets"],
  ["dana@capitalins", "no domain ending"],
  ["dana capitalins.com", "no @"],
  ["dana@@capitalins.com", "two @"],
  ["dana@capitalins.com\r\nBcc: everyone@x.com", "a header slipped in"],
  ["dana@-capitalins.com", "a domain starting with a dash"],
  [`${"a".repeat(250)}@x.com`, "longer than 254"],
  ["", "empty"],
]) {
  check(`not one address: ${why}`, !isMailbox(bad), bad);
}

// --- the form's rules ---------------------------------------------------------------
{
  const good = { lead_id: "12", to: "dana@capitalins.com", subject: "Following up", body: "Hi Dana," };
  check("a complete email passes", validate(good, schemas.leadEmail).ok);
  const r = validate({ lead_id: "12", to: "dana@capitalins.com, boss@capitalins.com", subject: "", body: "" }, schemas.leadEmail);
  check("…two addresses, no subject and no message are each named",
    /one email address/.test(r.errors.to ?? "") && /subject/.test(r.errors.subject ?? "") && /Write the email/.test(r.errors.body ?? ""), JSON.stringify(r.errors));
  const long = validate({ ...good, subject: "x".repeat(EMAIL_LIMITS.subject + 1), body: "y".repeat(EMAIL_LIMITS.body + 1) }, schemas.leadEmail);
  check("…as are a subject and a message over their limits", Boolean(long.errors.subject && long.errors.body), JSON.stringify(long.errors));
  check("…and a missing name", Boolean(validate({ ...good, lead_id: "" }, schemas.leadEmail).errors.lead_id));
  check("the From address in Settings is one plain address too", Boolean(validate({ org_name: "Signature", mail_from: "Alerts <a@x.com>" }, schemas.settings).errors.mail_from));
}

// --- one line ---------------------------------------------------------------------
check("a subject stays on one line", oneLine("Following up\r\nBcc: everyone@x.com") === "Following up Bcc: everyone@x.com");
check("…with its spaces tidied", oneLine("  Quote  for   Acme \t") === "Quote for Acme");

// --- why it was not sent ---------------------------------------------------------------
const says = (label, err, re) => check(label, re.test(mailFailure(err)), mailFailure(err));
says("no mail login on the server", { code: "ENOCONFIG" }, /isn't connected yet/);
says("the server refused the login", { code: "EAUTH", response: "535 5.7.3 Authentication unsuccessful" }, /didn't accept the server's login/);
says("the server would not encrypt", { code: "ETLS" }, /wouldn't encrypt/);
says("the server could not be reached", { code: "ECONNECTION" }, /Couldn't reach the mail server/);
says("…or timed out", { code: "ETIMEDOUT" }, /Couldn't reach/);
says("the address was refused, with the server's reason", { code: "EENVELOPE", response: "550 5.1.1 <dana@nowhere.test>: Recipient address rejected" },
  /refused the address: 550 5\.1\.1 <dana@nowhere\.test>: Recipient address rejected/);
says("the email was refused", { code: "EMESSAGE", response: "552 5.3.4 Message too big" }, /refused the email: 552/);
says("anything else, plainly", new Error("socket hang up"), /could not be sent: socket hang up/);
check("a long reply is cut short, on one line", (() => {
  const m = mailFailure({ code: "EENVELOPE", response: `550 ${"x".repeat(400)}\r\nmore` });
  return m.length < 260 && !/[\r\n]/.test(m) && m.endsWith("…");
})());

// --- Resend's API ----------------------------------------------------------------
check("a sender is written \"Name\" <address>", mailboxHeader({ name: "Sean Fitzgerald", address: "alerts@signaturemktg.net" }) === '"Sean Fitzgerald" <alerts@signaturemktg.net>');
check("…a comma or quote in the name cannot split it", mailboxHeader({ name: 'Fitz, "Sean"', address: "a@x.com" }) === '"Fitz, Sean" <a@x.com>');
check("…no name, just the address", mailboxHeader({ name: "", address: "a@x.com" }) === "a@x.com");
says("Resend: a bad key is a refused login", resendFailure(401, { message: "API key is invalid" }), /didn't accept the server's login/);
says("Resend: an unverified domain, in its own words", resendFailure(403, { message: "The signaturemktg.net domain is not verified." }), /refused the email: The signaturemktg\.net domain is not verified/);
says("Resend: down on its side", resendFailure(503, {}), /Couldn't reach the mail server/);

console.log(failures ? `\n${failures} email check(s) failed.\n` : "\nAll email checks passed.\n");
process.exit(failures ? 1 : 0);
