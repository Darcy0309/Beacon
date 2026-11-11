// A lead's Conversation as one thread (client, Nov 2026): the calls and texts on the Lighthouse phone,
// the call results the callers logged, and the call-back reminders, together (the old Call History
// tab folded in). Pure, so the page and the tests share it.

// How long after a call its result may be logged and still be taken as that call's.
const RESULT_WITHIN_MS = 2 * 60 * 60 * 1000;
// A little slack for clocks: a result stamped just before the call it belongs to.
const EARLY_MS = 60 * 1000;

const time = (iso) => new Date(iso ?? 0).getTime();

/**
 * One thread, oldest first. `items`: getLeadConversation()'s calls and texts; `log`: the lead's
 * logged call results ({ id, at, result, notes, stage, by, userId }) and reminders
 * ({ id, reminder: true, at, by, sent, forWhen, note }).
 *
 * A result goes on the Lighthouse call it was logged for (the same caller's latest call before it,
 * within two hours, not already given one); a result with none (a call made on another phone) and
 * each reminder stand in the thread by themselves.
 */
export function conversationThread(items = [], log = []) {
  const thread = (items ?? []).map((i) => (i.kind === "call" ? { ...i, result: null } : i));
  const calls = thread.filter((i) => i.kind === "call" && i.userId);

  for (const entry of [...(log ?? [])].sort((a, b) => time(a.at) - time(b.at))) {
    if (entry.reminder) {
      thread.push({ ...entry, key: `r${entry.id}`, kind: "reminder" });
      continue;
    }
    const at = time(entry.at);
    const call = entry.userId
      ? calls
          .filter((c) => !c.result && c.userId === entry.userId && time(c.at) - EARLY_MS <= at && at - time(c.at) <= RESULT_WITHIN_MS)
          .sort((a, b) => time(b.at) - time(a.at))[0]
      : null;
    const result = { id: entry.id, result: entry.result, notes: entry.notes ?? null, stage: entry.stage ?? null };
    if (call) call.result = result;
    else thread.push({ ...result, key: `l${entry.id}`, kind: "result", at: entry.at, by: entry.by ?? null });
  }
  return thread.sort((a, b) => time(a.at) - time(b.at));
}
