/**
 * Chat as other apps have it (Oct 2026), in a real browser, both sides of
 * one conversation: a quick reaction, and one from the other side arriving
 * live; an emoji from the picker; replying to one message (quoted above the
 * reply); a GIF from GIPHY (needs GIPHY_API_KEY on the server); a voice
 * message recorded (Chrome's fake microphone), sent and played by the other
 * person; a reaction taken off again.
 *
 *   npm run test:e2e
 */
import { check, finish, section, until } from "../support/assert.mjs";
import { signIn } from "../support/auth.mjs";
import { sql, lit } from "../support/db.mjs";
import { launchBrowser } from "../support/browser.mjs";

const TAG = `Chat extras ${Date.now()}`;
const ADMIN = Number(sql("select id from public.users where email='admin@beacon.test'"));
const SEAN = Number(sql("select id from public.users where email='sean@beacon.test'"));
const sean = await signIn("sean@beacon.test");
const { error: sendErr } = await sean.sb.rpc("send_notification", { p_user_ids: [ADMIN], p_roles: [], p_title: `${TAG}: quarterly numbers`, p_body: "Can you send the Q4 numbers?", p_link: null });
const M = Number(sql(`select id from public.notifications where user_id=${ADMIN} and title=${lit(`${TAG}: quarterly numbers`)}`));

const browser = await launchBrowser({ mouse: true, args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", "--autoplay-policy=no-user-gesture-required"] });
const when = (page, expr, timeout = 25000) => until(() => page.ev(expr), { timeout });
const click = (page, sel) => page.ev(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return false; el.click(); return true; })()`);
const setValue = (page, sel, value) => page.ev(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement : HTMLInputElement;
  Object.getOwnPropertyDescriptor(proto.prototype, 'value').set.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
const mine = (kind) => sql(`select coalesce(max(id), 0) from public.notifications where sender_id=${ADMIN} and user_id=${SEAN} and kind='message' and created_at > now() - interval '10 minutes'${kind ? ` and attachment->>'kind' = '${kind}'` : ""}`);
try {
  check("the other person sends a message", !sendErr && M > 0, sendErr?.message);
  const admin = await (await browser.newContext({ as: "admin@beacon.test" })).newPage({ width: 1440, height: 1000 });
  await admin.go(`/notifications/${M}`, 8000);
  await when(admin, `!!document.querySelector('[data-message-id="${M}"]')`, 30000);

  section("A reaction");
  await click(admin, `[data-message-id="${M}"] [data-quick-react="👍"]`);
  check("a quick 👍 shows under the message", Boolean(await when(admin, `!!document.querySelector('[data-message-id="${M}"] [data-reaction="👍"]')`)));
  check("…and is kept", Boolean(await until(() => sql(`select count(*) from public.message_reactions where message_id=${M} and user_id=${ADMIN} and emoji='👍'`) === "1" || null, { timeout: 10000 })));

  section("An emoji, and replying to one message");
  await click(admin, `[data-reply-to="${M}"]`);
  check("Reply shows what it answers above the box", Boolean(await when(admin, `!!document.querySelector('[data-replying-to="${M}"]')`)));
  await click(admin, "[data-emoji-open]");
  await when(admin, "!!document.querySelector('[data-emoji-find]')");
  await setValue(admin, "[data-emoji-find]", "rocket");
  await when(admin, `!!document.querySelector('[data-emoji="🚀"]')`);
  await click(admin, `[data-emoji="🚀"]`);
  check("an emoji from the picker goes in the box", Boolean(await when(admin, `document.querySelector('textarea[name="body"]').value.includes('🚀')`)));
  await setValue(admin, 'textarea[name="body"]', "On it, sending today 🚀");
  await admin.ev(`document.querySelector('textarea[name="body"]').form.requestSubmit()`);
  const R = Number(await until(() => { const v = sql(`select id from public.notifications where sender_id=${ADMIN} and body='On it, sending today 🚀' and quote_id=${M}`); return v ? v : null; }, { timeout: 15000 }));
  check("sent as a reply to that message", R > 0);
  check("…shown with the quote above it", Boolean(await when(admin, `!!document.querySelector('[data-message-id="${R}"] [data-quote="${M}"]')`)));

  section("A GIF");
  await click(admin, "[data-gif-open]");
  const gifs = await when(admin, "document.querySelectorAll('[data-gif]').length || document.querySelector('[data-gif-error]')?.textContent || null", 20000);
  check("GIPHY's trending GIFs load", typeof gifs === "number" && gifs > 0, String(gifs));
  await setValue(admin, "[data-gif-find]", "thank you");
  await until(() => admin.ev("document.querySelectorAll('[data-gif]').length > 0 || null"), { timeout: 20000 });
  await click(admin, "[data-gif]");
  const G = Number(await until(() => { const v = mine("gif"); return v !== "0" ? v : null; }, { timeout: 15000 }));
  check("a GIF sent, from GIPHY's own address", /^https:\/\/(media\d*|i)\.giphy\.com\//.test(sql(`select attachment->>'url' from public.notifications where id=${G}`)));
  check("…shown in the conversation", Boolean(await when(admin, `!!document.querySelector('[data-message-id="${G}"] [data-gif-message]')`)));

  section("A voice message");
  await when(admin, "!!document.querySelector('[data-voice-record]:not([disabled])')");
  await click(admin, "[data-voice-record]");
  check("recording", Boolean(await when(admin, "document.querySelector('[data-voice-recorder]')?.dataset.voiceRecorder === 'recording'")),
    await admin.ev("[...document.querySelectorAll('[data-sonner-toast]')].map((t) => t.textContent).join(' | ')"));
  await new Promise((r) => setTimeout(r, 2000));
  await click(admin, "[data-voice-stop]");
  check("stopped: there to hear before sending", Boolean(await when(admin, "document.querySelector('[data-voice-recorder]')?.dataset.voiceRecorder === 'ready'")));
  await click(admin, "[data-voice-send]");
  const V = Number(await until(() => { const v = mine("voice"); return v !== "0" ? v : null; }, { timeout: 20000 }));
  const voice = JSON.parse(sql(`select coalesce(attachment, '{}') from public.notifications where id=${V || 0} union all select '{}' limit 1`));
  check("sent: kept privately under the sender's folder, its length with it", String(voice.path ?? "").startsWith(`voice/${ADMIN}/`) && voice.seconds >= 1
    && sql(`select count(*) from storage.objects where bucket_id='chat-voice' and name=${lit(voice.path)}`) === "1", JSON.stringify(voice));
  check("…shown as a player", Boolean(await when(admin, `!!document.querySelector('[data-message-id="${V}"] [data-voice-message]')`)));

  section("The other side");
  const seanPage = await (await browser.newContext({ as: "sean@beacon.test" })).newPage({ width: 1440, height: 1000 });
  await seanPage.go(`/notifications/${R}`, 8000);
  await when(seanPage, `!!document.querySelector('[data-message-id="${V}"]')`, 30000);
  check("they see the 👍 on their message, the quote, the GIF and the voice message",
    await seanPage.ev(`!!document.querySelector('[data-message-id="${M}"] [data-reaction="👍"]') && !!document.querySelector('[data-message-id="${R}"] [data-quote="${M}"]')
      && !!document.querySelector('[data-message-id="${G}"] [data-gif-message]') && !!document.querySelector('[data-message-id="${V}"] [data-voice-message]')`));
  await click(seanPage, `[data-message-id="${V}"] [data-voice-play]`);
  check("…and can play the voice message", Boolean(await when(seanPage, `document.querySelector('[data-message-id="${V}"] [data-voice-play]')?.getAttribute('aria-label') === 'Pause voice message'
    || [...document.querySelectorAll('[data-sonner-toast]')].some((t) => /voice message/i.test(t.textContent)) && 'toast'`)) === true);
  await click(seanPage, `[data-message-id="${R}"] [data-quick-react="😂"]`);
  check("their reaction reaches the sender live", Boolean(await when(admin, `!!document.querySelector('[data-message-id="${R}"] [data-reaction="😂"]')`)));

  section("Taking a reaction off");
  await click(admin, `[data-message-id="${M}"] [data-reaction="👍"]`);
  check("clicking your own takes it off", Boolean(await when(admin, `!document.querySelector('[data-message-id="${M}"] [data-reaction="👍"]')`)));
  check("…there too, live", Boolean(await when(seanPage, `!document.querySelector('[data-message-id="${M}"] [data-reaction="👍"]')`)));
} finally {
  browser.close();
  // The recordings go through the Storage API (it keeps the files and their rows together), once nothing refers to them.
  const paths = sql(`select coalesce(string_agg(name, ','), '') from storage.objects where bucket_id='chat-voice' and name like ${lit(`voice/${ADMIN}/%`)} and created_at > now() - interval '30 minutes'`).split(",").filter(Boolean);
  sql(`delete from public.notifications where (sender_id=${ADMIN} and user_id=${SEAN} and created_at > now() - interval '30 minutes') or id=${M || 0}`);
  if (paths.length) await (await signIn("admin@beacon.test")).sb.storage.from("chat-voice").remove(paths);
}

finish("chat extras");
