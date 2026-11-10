"use server";

/** Program Funding (client, Nov 2026): payments marked paid, reminders to the client, and the client's switch for them. */

import { revalidatePath } from "next/cache";
import { isReservedAddress, mailFailure, oneLine } from "@/lib/email";
import { currentAppUser, fail, logActivity, ok } from "@/lib/server/action-helpers";
import { mailServer, sendMail } from "@/lib/server/mail";
import { createClient } from "@/lib/supabase/server";
import { usd } from "@/lib/funding";
import { formatIso } from "@/lib/dates";

const idOf = (v) => (/^[1-9]\d{0,17}$/.test(String(v ?? "")) ? Number(v) : null);
const refresh = () => {
  revalidatePath("/payments");
  revalidatePath("/projects", "layout");
};

/** Paid, or not after all: an administrator or the client's Sales Rep (the database checks). */
export async function setPaymentPaid(paymentId, paid) {
  const id = idOf(paymentId);
  if (!id) return fail("That payment couldn't be found.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_payment_paid", { p_payment: id, p_paid: Boolean(paid) });
  if (error) return fail(error);
  await logActivity(supabase, paid ? "payment.paid" : "payment.unpaid", { entity: "project_payment", entityId: id });
  refresh();
  return ok({ id, paid: Boolean(paid) });
}

const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/**
 * Email the client a reminder of a payment due (client, Nov 2026: the Sales Rep's to send), to
 * their people in Lighthouse, from the company's address with replies to the sender. Only for a
 * client with payment reminders on, and not for a payment already paid.
 */
export async function sendPaymentReminder(paymentId) {
  const id = idOf(paymentId);
  if (!id) return fail("That payment couldn't be found.");
  const supabase = await createClient();
  const me = await currentAppUser(supabase);
  if (!me) return fail("Sign in again to do that.");
  const { data: p, error } = await supabase.rpc("payment_reminder", { p_payment: id });
  if (error) return fail(error);
  if (!p?.on) return fail("Payment reminders are off for this client. Turn them on on the client's page.");
  if (p.paid) return fail("That payment is already paid.");
  if (!p.to?.length) return fail("This client has no one in Lighthouse with an email address to remind.");
  if (!mailServer()) return fail(mailFailure({ code: "ENOCONFIG" }));

  const { data: settings } = await supabase.from("app_settings").select("key, value").in("key", ["mail", "organization"]);
  const setting = (k) => settings?.find((s) => s.key === k)?.value ?? {};
  const from = setting("mail").from;
  if (!from) return fail("There's no address to send from: set it in Settings › Email.");
  const org = setting("organization").name || "Signature Marketing";
  const { data: sender } = await supabase.from("users").select("first_name, last_name").eq("id", me.id).maybeSingle();
  const named = [sender?.first_name, sender?.last_name].filter(Boolean).join(" ").trim();
  const due = p.due ? formatIso(p.due, "long") : null;
  const subject = oneLine(`Payment reminder: ${usd(p.amount)}${due ? ` due ${due}` : ""} · ${p.project}`);
  const lines = [
    `Hi${p.to.length === 1 && p.to[0].name ? ` ${oneLine(p.to[0].name.split(" ")[0])}` : ""},`,
    `A friendly reminder that your payment for ${p.project} (${p.label}) of ${usd(p.amount)} is ${due ? `due ${due}` : "coming up"}.`,
    "If it's already on its way, thank you, and please disregard this note. Any questions, just reply to this email.",
    named ? `${named}\n${org}` : org,
  ];
  const text = lines.join("\n\n");
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#111827;line-height:1.5">${lines.map((l) => `<p>${esc(l).replace(/\n/g, "<br>")}</p>`).join("")}</div>`;
  const replyTo = me.email && !isReservedAddress(me.email) ? { name: named || org, address: me.email } : undefined;
  try {
    await sendMail({ from: { name: org, address: from }, replyTo, to: p.to.map((t) => ({ name: t.name ?? "", address: t.email })), subject, text, html });
  } catch (err) {
    return fail(`The reminder was not sent: ${mailFailure(err)}`);
  }
  await supabase.rpc("payment_reminder", { p_payment: id, p_sent: true });
  await logActivity(supabase, "payment.reminder", { entity: "project_payment", entityId: id, detail: `${p.client} · ${p.label} · to ${p.to.map((t) => t.email).join(", ")}`, userId: me.id });
  refresh();
  return ok({ to: p.to.map((t) => t.email) });
}

/** A client's payment reminders, on or off (administrators). */
export async function setClientPaymentReminders(companyId, on) {
  const id = idOf(companyId);
  if (!id) return fail("That client couldn't be found.");
  const supabase = await createClient();
  const me = await currentAppUser(supabase);
  if (me?.role !== "admin") return fail("Only an administrator changes this.");
  const { data, error } = await supabase.from("companies").update({ payment_reminders: Boolean(on) }).eq("id", id).select("id").maybeSingle();
  if (error) return fail(error);
  if (!data) return fail("Nothing was saved: that client may have been deleted.");
  await logActivity(supabase, "client.payment_reminders", { entity: "company", entityId: id, detail: on ? "on" : "off", userId: me.id });
  revalidatePath("/clients", "layout");
  revalidatePath("/payments");
  return ok({ on: Boolean(on) });
}
