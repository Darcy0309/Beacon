// Emailing a name's contact from its lead sheet: the limits and wording the
// form and the server share. Dependency-free so it runs in both places.

export const EMAIL_LIMITS = {
  subject: 200,
  body: 10000,
  // Emails one person may send in an hour: plenty for following up calls,
  // and a cap on what a mistake or a stolen login could send.
  perHour: 50,
};

// One plain address, as a browser's type="email" field accepts it: no name,
// no commas or angle brackets, so an email always goes to exactly one person.
const MAILBOX = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;

export const isMailbox = (value) => {
  const v = String(value ?? "").trim();
  return v.length <= 254 && MAILBOX.test(v);
};

/** A subject on one line: a line break in a header would start a new one. */
export const oneLine = (value) => String(value ?? "").replace(/\s+/g, " ").trim();

const clip = (text, n = 200) => {
  const t = oneLine(text);
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

/**
 * Why an email was not sent, in words the sender can act on. `err` is what
 * the mail library threw: a code for what went wrong, and the mail server's
 * own reply when it gave one. Kept with the email on the lead's history.
 */
export function mailFailure(err) {
  const reply = err?.response ? clip(err.response) : "";
  switch (err?.code) {
    case "ENOCONFIG":
      return "Email isn't connected yet: the server has no mail login. Ask an administrator.";
    case "EAUTH":
      return "The mail server didn't accept the server's login, so nothing was sent. Ask an administrator to check the mail settings.";
    case "ETLS":
    case "EREQUIRETLS":
      return "The mail server wouldn't encrypt the connection, so nothing was sent. Ask an administrator to check the mail settings.";
    case "ECONNECTION":
    case "ETIMEDOUT":
    case "ESOCKET":
    case "EDNS":
    case "EGREETING":
      return "Couldn't reach the mail server, so nothing was sent. Try again in a minute.";
    case "EENVELOPE":
      return `The mail server refused the address${reply ? `: ${reply}` : "."}`;
    default:
      return reply
        ? `The mail server refused the email: ${reply}`
        : `The email could not be sent${err?.message ? `: ${clip(err.message)}` : "."}`;
  }
}

/** "Name <address>", the name quoted (quotes and backslashes dropped) so a comma in it cannot split it. */
export function mailboxHeader({ name, address }) {
  const clean = oneLine(name).replace(/["\\]/g, "");
  return clean ? `"${clean}" <${address}>` : address;
}

/**
 * Resend's API refusing an email, as the mail library's errors look, so
 * mailFailure() explains it the same way: a bad key is a refused login,
 * anything else the service's own reason.
 */
export function resendFailure(status, body) {
  const reason = body?.message || body?.error || `HTTP ${status}`;
  const code = status === 401 || (status === 403 && /api key/i.test(reason)) ? "EAUTH" : status >= 500 ? "ECONNECTION" : "EMESSAGE";
  return Object.assign(new Error(reason), { code, response: reason });
}
