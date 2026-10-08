// Lead delivery: a project's delivery addresses, and the lead sheet emailed
// to them. Dependency-free (pure) so the server, the project form and the
// tests share it.

import { isMailbox } from "./email.js";

const esc = (v) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/**
 * The addresses a project's leads go to, from its delivery field: separated
 * by commas, semicolons or spaces. As in the old system, one starting with
 * "_" gets a link to the sheet instead of the sheet; `linkOnly` sends every
 * address a link. Repeats are dropped; `bad` lists what is not an address.
 */
export function parseDeliveryAddresses(text, linkOnly = false) {
  const seen = new Set();
  const list = [];
  const bad = [];
  for (const raw of String(text ?? "").split(/[\s,;]+/)) {
    if (!raw) continue;
    const link = raw.startsWith("_");
    const address = (link ? raw.slice(1) : raw).trim();
    if (!isMailbox(address)) {
      bad.push(raw);
      continue;
    }
    const key = address.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    list.push({ address, linkOnly: linkOnly || link });
  }
  return { list, bad };
}

/** The subject, as the old system wrote it: "<result> - <company>". */
export const deliverySubject = (result, company) => `${result} - ${company}`.slice(0, 200);

// A value on the sheet: text, a link ({ text, href }), or text with links
// under it ({ text, links: [{ label, href }], linksLabel }).
const textOf = (v) => (v != null && typeof v === "object" ? v.text : v);
const blank = (v) => textOf(v) == null || String(textOf(v)).trim() === "";
const A = "color:#0e7490;text-decoration:underline;";

// The logo image is 266 x 103: shown at 180 wide, so it stays sharp on most screens.
const logoHtml = (url) =>
  url ? `<img src="${esc(url)}" alt="Signature Marketing" width="180" height="70" style="display:block;border:0;outline:none;height:auto;max-width:180px;margin:0 0 14px;">` : "";

// The website and email addresses open with a click, on a desktop too.
const siteLink = (site) => {
  const text = String(site ?? "").trim();
  if (!text) return null;
  const href = /^https?:\/\//i.test(text) ? text : `https://${text}`;
  return /^https?:\/\/[^\s/$.?#][^\s]*$/i.test(href) ? { text, href } : text;
};
const mailLink = (address) => {
  const text = String(address ?? "").trim();
  return text ? (isMailbox(text) ? { text, href: `mailto:${text}` } : text) : null;
};

function cellHtml(v) {
  if (v == null || typeof v !== "object") return esc(v);
  if (v.href) return `<a href="${esc(v.href)}" style="${A}">${esc(v.text)}</a>`;
  const links = (v.links ?? []).map((l) => `<a href="${esc(l.href)}" style="${A}">${esc(l.label)}</a>`).join(" &middot; ");
  return `${esc(v.text)}${links ? `<br><span style="font-size:13px;color:#6b7280;">${esc(v.linksLabel ?? "")}${v.linksLabel ? ": " : ""}${links}</span>` : ""}`;
}

function cellText(v) {
  if (v == null || typeof v !== "object") return String(v);
  // A link that only repeats its text (an address, a website) is the text alone.
  if (v.href) return v.href.startsWith("mailto:") || v.href.replace(/^https?:\/\//i, "") === String(v.text).replace(/^https?:\/\//i, "") ? String(v.text) : `${v.text} (${v.href})`;
  return [v.text, ...(v.links ?? []).map((l) => `  ${v.linksLabel ? `${v.linksLabel}, ` : ""}${l.label}: ${l.href}`)].join("\n");
}

/**
 * The lead sheet, as an email (HTML with inline styles, which mail programs
 * need, and the same in plain text) and as the page a link opens. It never
 * says when the lead or appointment was entered: the client asked not to.
 *
 * `s`: { company, result, client, project, producer, listSource, rep,
 *   appointment: { date, time, with, links: [{ label, href }] } | null,
 *   people: [{ who, name, title, phone, mobile, email }],
 *   address: [lines], map: url | null, website, fax,
 *   coverage: { ultimate, agency, lines: [{ label, xdate, carrier }] },
 *   profile: [[label, value]], notes: [[label, text]],
 *   logo: url | null }   (the business's logo, at the top as on its old sheets)
 */
export function renderLeadSheet(s) {
  const sections = [];
  const rows = (pairs) => pairs.filter(([, v]) => !blank(v));
  const appointment = s.appointment
    ? { text: [s.appointment.date, s.appointment.time].filter(Boolean).join(" at "), links: s.appointment.links ?? [], linksLabel: "Add to calendar" }
    : null;
  const address = (s.address ?? []).join(", ");

  sections.push(["Client information", rows([
    ["Client", s.client], ["Project", s.project], ["Producer name", s.producer], ["List source", s.listSource], ["Account manager", s.rep],
  ])]);
  sections.push(["Result", rows([
    ["Call result", s.result],
    ...(appointment ? [["Appointment", appointment], ["With", s.appointment.with]] : []),
  ])]);
  sections.push(["Prospect", rows([
    ["Company", s.company], ["Address", s.map && address ? { text: address, href: s.map } : address], ["Website", siteLink(s.website)], ["Fax", s.fax],
  ])]);
  for (const p of s.people ?? []) {
    const pairs = rows([["Name", [p.name, p.title].filter(Boolean).join(", ")], ["Business phone", p.phone], ["Mobile", p.mobile], ["Email", mailLink(p.email)]]);
    if (pairs.length) sections.push([p.who, pairs]);
  }
  const lines = (s.coverage?.lines ?? []).filter((l) => !blank(l.xdate) || !blank(l.carrier));
  // The prospect's agency after the policies, not beside the renewal date.
  sections.push(["Policy information", rows([
    ["Ultimate X-Date", s.coverage?.ultimate],
    ...lines.map((l) => [l.label, [l.xdate, l.carrier].filter(Boolean).join(" · ")]),
    ["Agency", s.coverage?.agency],
  ])]);
  sections.push(["Profile", rows(s.profile ?? [])]);
  sections.push(["Notes", rows(s.notes ?? [])]);

  const shown = sections.filter(([, pairs]) => pairs.length);

  const td = "padding:6px 10px;border-top:1px solid #e5e7eb;font-size:14px;vertical-align:top;";
  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f5f7fa;font-family:Arial,Helvetica,sans-serif;color:#111827;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:680px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;">
<tr><td style="padding:18px 20px;border-bottom:3px solid #0891b2;">
${logoHtml(s.logo)}<div style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#6b7280;">Lead sheet</div>
<div style="font-size:20px;font-weight:bold;margin-top:4px;">${esc(s.company)}</div>
<div style="font-size:14px;color:#0e7490;margin-top:2px;">${esc(s.result)}</div>
</td></tr>
${shown.map(([title, pairs]) => `<tr><td style="padding:14px 10px 4px;">
<div style="font-size:11px;font-weight:bold;letter-spacing:.12em;text-transform:uppercase;color:#6b7280;padding:0 10px 6px;">${esc(title)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
${pairs.map(([k, v]) => `<tr><td style="${td}width:34%;color:#6b7280;">${esc(k)}</td><td style="${td}white-space:pre-line;">${cellHtml(v)}</td></tr>`).join("\n")}
</table></td></tr>`).join("\n")}
<tr><td style="padding:14px 20px;font-size:12px;color:#9ca3af;">Sent by Lighthouse CRM</td></tr>
</table></body></html>`;

  const text = [
    `LEAD SHEET: ${s.company}`,
    s.result,
    ...shown.flatMap(([title, pairs]) => ["", title.toUpperCase(), ...pairs.map(([k, v]) => `${k}: ${cellText(v)}`)]),
  ].join("\n");

  return { html, text };
}

/** The email for an address that gets a link instead of the sheet. */
export function renderLeadLink(s, url, days) {
  const html = `<!doctype html><html><body style="margin:0;padding:24px;font-family:Arial,Helvetica,sans-serif;color:#111827;">
${logoHtml(s.logo)}<p style="font-size:15px;margin:0 0 6px;"><b>${esc(s.result)}</b>: ${esc(s.company)}</p>
<p style="font-size:14px;margin:0 0 14px;color:#4b5563;">${esc([s.client, s.project].filter(Boolean).join(" · "))}</p>
<p style="margin:0 0 14px;"><a href="${esc(url)}" style="display:inline-block;background:#0891b2;color:#ffffff;text-decoration:none;padding:10px 16px;border-radius:6px;font-size:14px;">View the lead sheet</a></p>
<p style="font-size:12px;color:#9ca3af;margin:0;">The link works for ${days} days. Sent by Lighthouse CRM.</p>
</body></html>`;
  const text = `${s.result}: ${s.company}\n${[s.client, s.project].filter(Boolean).join(" · ")}\n\nView the lead sheet: ${url}\n(The link works for ${days} days.)`;
  return { html, text };
}
