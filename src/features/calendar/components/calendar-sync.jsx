"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarSync as SyncIcon, EyeOff, Link2, RefreshCw, Unlink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, formHelpers } from "@/components/ui/field";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { connectCalendar, disconnectCalendar, syncCalendarNow } from "@/features/calendar/actions";
import ConfirmDialog from "@/components/shared/confirm-dialog";
import { reach } from "@/lib/reach";

const EMPTY = { ok: false, data: null, error: null, fieldErrors: null, values: null };

// Where each calendar keeps its private link.
const WHERE = [
  ["Google Calendar", "Settings → your calendar (on the left) → Integrate calendar → “Secret address in iCal format”."],
  ["Outlook", "Settings → Calendar → Shared calendars → Publish a calendar → choose “Can view when I'm busy” → copy the ICS link."],
  ["iCloud (iPhone, iPad, Mac)", "Calendar → the ⓘ beside your calendar → Public Calendar → Share Link."],
];
const ago = (iso) => {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} hr ago` : `${Math.round(m / 1440)} days ago`;
};

/**
 * "Sync my calendar" on a project's calendar: connect my own calendar
 * (Google, Outlook or iCloud) by its private link, so the times I am busy
 * are blocked out here by themselves. Only when I am busy is read: never
 * what an event is, where, or with whom. Connected, it says when it was
 * last read, reads it again on demand, and disconnects (the busy times go
 * with it). `feed`: getMyCalendarFeed(), or null.
 */
export default function CalendarSync({ projectId, feed }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(connectCalendar, EMPTY);
  const [working, startWork] = useTransition();
  const [asking, setAsking] = useState(false); // about to disconnect
  const { fe, invalid } = formHelpers(state, null);
  const handled = useRef(null);
  useEffect(() => {
    if (state === handled.current) return;
    handled.current = state;
    if (state?.ok) {
      toast.success(`${state.data.provider} connected: ${state.data.busy} busy time${state.data.busy === 1 ? "" : "s"} blocked out`);
      setOpen(false);
      router.refresh();
      // A wrong link is said under it; anything else (signed out, not your calendar) here.
    } else if (state?.error && !state?.fieldErrors) toast.error(state.error);
  }, [state, router]);

  const run = (fn, done) =>
    startWork(async () => {
      const f = new FormData();
      f.set("id", String(feed.id));
      const result = await reach(() => fn(f));
      if (result.ok) {
        toast.success(done(result.data));
        setAsking(false);
        router.refresh();
      } else toast.error(result.error);
    });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="outline" className="shrink-0" data-sync-calendar data-connected={feed ? "" : undefined}>
          <SyncIcon /> {feed ? `${feed.provider} synced` : "Sync my calendar"}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Sync my calendar</DialogTitle>
          <DialogDescription>
            The times you are busy on your own calendar are blocked out on this project&apos;s calendar by themselves, so nobody books over them.
          </DialogDescription>
        </DialogHeader>
        <p className="flex items-start gap-2 rounded-md border border-emerald-400/40 bg-emerald-400/5 px-3 py-2 text-xs">
          <EyeOff className="mt-0.5 size-3.5 shrink-0 text-emerald-500" />
          <span>Only <strong>when</strong> you are busy is read. What an event is, where it is and who it is with are never read, kept or shown.</span>
        </p>

        {feed ? (
          <div className="space-y-3" data-feed-status>
            <div className="rounded-lg border border-[var(--panel-border)] px-3 py-2.5 text-sm">
              <div className="font-semibold">{feed.provider} is connected</div>
              <div className="text-xs text-muted-foreground">
                {feed.busy} busy time{feed.busy === 1 ? "" : "s"} in the next 90 days{feed.syncedAt ? ` · read ${ago(feed.syncedAt)}` : ""} · read again every 15 minutes while this calendar is in use
              </div>
              {feed.error ? <div role="alert" className="mt-1 text-xs font-medium text-destructive">Last time it could not be read: {feed.error}</div> : null}
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" size="sm" disabled={working} data-sync-now
                onClick={() => run(syncCalendarNow, (d) => `Read again: ${d.busy} busy time${d.busy === 1 ? "" : "s"}`)}><RefreshCw /> Sync now</Button>
              <Button type="button" variant="outline" size="sm" disabled={working} data-disconnect
                onClick={() => setAsking(true)}><Unlink /> Disconnect</Button>
            </div>
            <p className="text-xs text-muted-foreground">To use a different calendar, paste its link below.</p>
            <ConfirmDialog open={asking} onOpenChange={setAsking} pending={working}
              title={`Disconnect ${feed.provider}?`}
              description="Its busy times come off this project's calendar, and the link to it is forgotten. You can connect it again whenever you like."
              confirm="Disconnect" icon={<Unlink />} onConfirm={() => run(disconnectCalendar, () => "Disconnected: its busy times are off the calendar")} />
          </div>
        ) : null}

        <form action={action} noValidate className="flex flex-col gap-3" data-sync-form>
          <input type="hidden" name="project_id" value={projectId} />
          <Field label="Your calendar's private link" required error={fe("url")}>
            <Input name="url" type="url" inputMode="url" placeholder="https://calendar.google.com/calendar/ical/…/basic.ics" autoComplete="off" spellCheck={false}
              aria-invalid={invalid("url")} />
          </Field>
          <details className="rounded-md border border-[var(--panel-border)] px-3 py-2 text-xs">
            <summary className="cursor-pointer font-medium">Where do I find the link?</summary>
            <dl className="mt-2 space-y-1.5">
              {WHERE.map(([name, how]) => (
                <div key={name}><dt className="font-semibold">{name}</dt><dd className="text-muted-foreground">{how}</dd></div>
              ))}
            </dl>
            <p className="mt-2 text-muted-foreground">Keep the link to yourself: it is stored where only you can use it, and you can disconnect at any time.</p>
          </details>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Close</Button>
            <Button type="submit" disabled={pending}><Link2 /> {pending ? "Reading your calendar…" : feed ? "Replace the link" : "Connect"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
