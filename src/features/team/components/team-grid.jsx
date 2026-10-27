"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarCheck, Eye, EyeOff, Gift, Heart, MessageSquare, PhoneCall, Search, Target, Trophy } from "lucide-react";
import Link from "@/components/shared/intent-link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { GiftDialog, MessageDialog, ThanksDialog } from "@/features/team/components/team-dialogs";
import { loadMemberRecent, setTeamSpotlight } from "@/features/team/actions";
import { imageUrl, initialsOf } from "@/lib/images";
import { reach } from "@/lib/reach";
import { ROLES } from "@/lib/nav";
import { TEAM_FILTERS, tenure } from "@/lib/team";
import { cn } from "@/lib/utils";

const STATUS = {
  calling: { label: "On the phones now", color: "var(--neon-emerald)" },
  active: { label: "Active today", color: "var(--neon-amber)" },
  away: { label: "Away", color: "var(--muted-foreground)" },
};
const SPOTLIGHT = [
  ["appointments", "Most appointments", CalendarCheck, "var(--neon-violet)"],
  ["leads", "Most leads", Target, "var(--neon-emerald)"],
  ["calls", "Most calls", PhoneCall, "var(--neon-cyan)"],
];

function Avatar({ m, size = "size-16", text = "text-lg" }) {
  return (
    <span className={cn("flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/12 font-bold text-primary", size, text)}>
      {m.photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl(m.photo)} alt={m.name} className="size-full object-cover" loading="lazy" />
      ) : initialsOf(m.name)}
    </span>
  );
}

/** "On the phones now", "Active today · last call 10:42 AM", "Away". */
function statusText(m, timeZone) {
  const s = STATUS[m.status] ?? STATUS.away;
  if (m.status === "active" && m.lastCall) {
    return `${s.label} · last call ${new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit" }).format(new Date(m.lastCall))}`;
  }
  return s.label;
}

/** What they did: for a client, what they developed for it; for staff, this month's. */
function workLine(m, client) {
  if (client) return m.leadsTotal || m.apptsTotal
    ? `For you: ${m.leadsMonth} lead${m.leadsMonth === 1 ? "" : "s"} · ${m.apptsMonth} appointment${m.apptsMonth === 1 ? "" : "s"} this month`
    : null;
  return m.leadsMonth || m.apptsMonth ? `This month: ${m.leadsMonth} leads · ${m.apptsMonth} appointments` : null;
}

/**
 * Meet the Team: the week's spotlight, the team as cards (photo, what they
 * do, whether they are on the phones now, their thank-yous, and for a client
 * what they did for it), a profile to open from each, a message, a
 * thank-you, and on someone's birthday a gift. Filtered by what people do,
 * by name and by those with a photo.
 *
 *   groups     [{ key, label, people }]: a client's own people first
 *   me         { id, role }
 */
export default function TeamGrid({ groups, me, spotlight, spotlightOn, today, timeZone }) {
  const [q, setQ] = useState("");
  const [photos, setPhotos] = useState(false);
  const [filter, setFilter] = useState("all");
  const [open, setOpen] = useState(null); // { kind: "profile" | "message" | "thanks" | "gift", member }
  const client = me.role === "client";
  const test = TEAM_FILTERS.find(([k]) => k === filter)?.[2] ?? (() => true);
  const match = (m) => (!q.trim() || m.name.toLowerCase().includes(q.trim().toLowerCase())) && (!photos || m.photo) && test(m);
  const shown = groups.map((g) => ({ ...g, people: g.people.filter(match) }));
  const none = shown.every((g) => g.people.length === 0);
  const everyone = groups.flatMap((g) => g.people);
  const birthdays = everyone.filter((m) => m.birthday);
  // Who may be written to: a client, the people who work its projects; staff, anyone else on the team.
  const canMessage = (m) => m.id !== me.id && (client ? m.mine : true);
  const act = (kind, member) => setOpen({ kind, member });
  // A window closing closes itself only: one closing late (its send just answered) leaves the next one open.
  const close = (kind) => (o) => !o && setOpen((cur) => (cur?.kind === kind ? null : cur));

  return (
    <div className="space-y-5">
      {/* Today's birthdays, at the top of the page. */}
      {birthdays.length ? (
        <div className="bday-banner flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3" data-birthday-banner>
          <span aria-hidden className="bday-flower text-2xl">💐</span>
          <span className="text-sm">
            <strong>Happy birthday</strong> to {birthdays.map((m) => m.name).join(" and ")}! 🎉
          </span>
          <span className="ml-auto flex flex-wrap gap-2">
            {birthdays.filter((m) => m.id !== me.id).map((m) => (
              <Button key={m.id} size="sm" onClick={() => act("gift", m)} data-banner-gift={m.id}><Gift /> Send {m.name.split(" ")[0]} a gift</Button>
            ))}
          </span>
        </div>
      ) : null}

      {spotlight && Object.keys(spotlight).length ? (
        <section data-team-spotlight>
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="flex items-center gap-1.5 text-[0.66rem] font-bold uppercase tracking-[0.14em] text-muted-foreground"><Trophy className="size-3.5 text-amber-400" /> Spotlight this week</h3>
            {me.role === "admin" ? <SpotlightSwitch on /> : null}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {SPOTLIGHT.map(([key, label, Icon, color]) => {
              const top = spotlight[key];
              return (
                <div key={key} className="flex items-center gap-3 rounded-xl border border-[var(--panel-border)] p-3" data-spotlight={key}
                  style={{ background: `linear-gradient(135deg, color-mix(in srgb, ${color} 12%, transparent), transparent 70%)` }}>
                  {top ? <Avatar m={top} size="size-12" text="text-sm" /> : <span className="flex size-12 items-center justify-center rounded-full bg-muted"><Icon className="size-5 text-muted-foreground" /></span>}
                  <span className="min-w-0">
                    <span className="flex items-center gap-1 text-xs font-semibold" style={{ color }}><Icon className="size-3.5" /> {label}</span>
                    <span className="block truncate font-semibold">{top ? top.name : "Nobody yet this week"}</span>
                    {top ? <span className="text-xs tabular-nums text-muted-foreground">{top.count.toLocaleString()} this week</span> : null}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      ) : me.role === "admin" && !spotlightOn ? (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-dashed border-[var(--panel-border)] px-4 py-2 text-sm text-muted-foreground">
          The week&apos;s spotlight is hidden. <SpotlightSwitch on={false} />
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Show">
          {TEAM_FILTERS.map(([key, label]) => (
            <button key={key} type="button" onClick={() => setFilter(key)} aria-pressed={filter === key} data-team-filter={key}
              className={cn("rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                filter === key ? "border-primary bg-primary/12 text-primary" : "border-[var(--panel-border)] text-muted-foreground hover:text-foreground")}>
              {label}
            </button>
          ))}
        </div>
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find someone by name…" className="pl-8" aria-label="Find someone by name" data-team-search />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={photos} onChange={(e) => setPhotos(e.target.checked)} className="size-4 accent-[var(--primary)]" data-team-photos />
          With a photo
        </label>
      </div>

      {shown.map((g) => (g.people.length ? (
        <section key={g.key} data-team-group={g.key}>
          {g.label ? <h3 className="mb-2 text-[0.66rem] font-bold uppercase tracking-[0.14em] text-muted-foreground">{g.label}</h3> : null}
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {g.people.map((m) => {
              const status = STATUS[m.status] ?? STATUS.away;
              const work = workLine(m, client);
              return (
                <li key={m.id} data-team-member={m.id} data-status={m.status} data-birthday={m.birthday || undefined}
                  className={cn("relative flex flex-col gap-3 overflow-hidden rounded-xl border border-[var(--panel-border)] bg-card p-4", m.birthday && "bday-card")}>
                  {m.birthday ? (
                    <>
                      <span aria-hidden className="bday-confetti" />
                      <span aria-hidden className="bday-flower absolute top-2 right-2 text-2xl">💐</span>
                    </>
                  ) : null}
                  <button type="button" onClick={() => act("profile", m)} className="flex items-start gap-3 text-left" data-open-profile={m.id}>
                    <span className="relative">
                      <Avatar m={m} />
                      <span title={statusText(m, timeZone)} data-status-dot={m.status}
                        className={cn("absolute right-0 bottom-0 size-4 rounded-full border-2 border-[var(--card)]", m.status === "calling" && "status-pulse")}
                        style={{ background: status.color }} />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-semibold hover:text-primary">{m.name}</span>
                      <span className="block text-xs text-muted-foreground">{m.does ?? ROLES[m.role]?.label ?? "Team"}</span>
                      <span className="mt-0.5 block text-xs" style={{ color: status.color }}>{statusText(m, timeZone)}</span>
                    </span>
                  </button>
                  {m.birthday ? (
                    <p className="relative rounded-lg bg-pink-500/10 px-3 py-2 text-sm font-medium text-pink-400" data-birthday-note>
                      🎉 Happy birthday, {m.name.split(" ")[0]}!{m.giftsToday ? ` · ${m.giftsToday} gift${m.giftsToday === 1 ? "" : "s"} today` : ""}
                    </p>
                  ) : null}
                  {m.bio ? <p className="line-clamp-3 text-sm leading-snug text-muted-foreground">{m.bio}</p> : null}
                  <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    {work ? <span data-work-line>{work}</span> : null}
                    {m.kudos ? <span className="inline-flex items-center gap-1 text-rose-400" data-kudos={m.kudos}><Heart className="size-3 fill-current" />{m.kudos}</span> : null}
                  </div>
                  {m.id !== me.id ? (
                    <div className="flex flex-wrap gap-1.5">
                      {m.birthday ? <Button size="sm" onClick={() => act("gift", m)} data-gift-button={m.id}><Gift /> Send a gift</Button> : null}
                      {canMessage(m) ? <Button size="sm" variant="outline" onClick={() => act("message", m)} data-message-button={m.id}><MessageSquare /> Message</Button> : null}
                      <Button size="sm" variant="ghost" onClick={() => act("thanks", m)} data-thanks-button={m.id}><Heart /> Thank</Button>
                    </div>
                  ) : <span className="text-xs text-muted-foreground">This is you</span>}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null))}
      {none ? <p className="py-10 text-center text-sm text-muted-foreground">Nobody matches that.</p> : null}

      {open?.kind === "profile" ? (
        <Profile member={open.member} client={client} today={today} timeZone={timeZone} onClose={() => close("profile")(false)}
          onAct={(kind) => setOpen({ kind, member: open.member })} canMessage={canMessage(open.member)} self={open.member.id === me.id} />
      ) : null}
      {open?.kind === "message" ? <MessageDialog member={open.member} open onOpenChange={close("message")} /> : null}
      {open?.kind === "thanks" ? <ThanksDialog member={open.member} open onOpenChange={close("thanks")} /> : null}
      {open?.kind === "gift" ? <GiftDialog member={open.member} open onOpenChange={close("gift")} /> : null}
    </div>
  );
}

/** An administrator shows or hides the week's spotlight. */
function SpotlightSwitch({ on }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button size="sm" variant="ghost" disabled={pending} data-spotlight-switch={on ? "hide" : "show"}
      onClick={() => start(async () => {
        const r = await reach(() => setTeamSpotlight(!on));
        if (r.ok) router.refresh();
        else toast.error(r.error);
      })}>
      {on ? <><EyeOff /> Hide</> : <><Eye /> Show it</>}
    </Button>
  );
}

/** A member's profile: the larger photo, what they do and since when, and what they developed lately (to open). */
function Profile({ member: m, client, today, timeZone, onClose, onAct, canMessage, self }) {
  const [recent, setRecent] = useState(null);
  useEffect(() => {
    let live = true;
    // Not loaded (offline) says so, rather than "Nothing yet".
    loadMemberRecent(m.id).then((r) => live && setRecent(r)).catch(() => live && setRecent(false));
    return () => {
      live = false;
    };
  }, [m.id]);
  const day = (iso) => new Intl.DateTimeFormat("en-US", { timeZone, month: "short", day: "numeric" }).format(new Date(iso));
  const stats = client
    ? [["This month for you", `${m.leadsMonth} leads · ${m.apptsMonth} appointments`], ["In all for you", `${m.leadsTotal ?? 0} leads · ${m.apptsTotal ?? 0} appointments`]]
    : [["This month", `${m.leadsMonth} leads · ${m.apptsMonth} appointments`]];
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className={cn("max-w-md", m.birthday && "bday-card")} data-profile-dialog={m.id}>
        {m.birthday ? <span aria-hidden className="bday-confetti" /> : null}
        <DialogHeader>
          <div className="flex items-center gap-4">
            <Avatar m={m} size="size-20" text="text-2xl" />
            <div className="min-w-0">
              <DialogTitle className="truncate">{m.name}{m.birthday ? " 🎂" : ""}</DialogTitle>
              <DialogDescription>{m.does ?? ROLES[m.role]?.label}</DialogDescription>
              <p className="mt-1 flex items-center gap-1.5 text-xs" style={{ color: (STATUS[m.status] ?? STATUS.away).color }}>
                <span className="size-2 rounded-full" style={{ background: (STATUS[m.status] ?? STATUS.away).color }} />{statusText(m, timeZone)}
              </p>
            </div>
          </div>
        </DialogHeader>
        {m.bio ? <p className="text-sm text-muted-foreground">{m.bio}</p> : null}
        <dl className="grid grid-cols-1 gap-2 text-sm" data-profile-facts>
          {m.since ? <div className="flex justify-between gap-3"><dt className="text-muted-foreground">On the team</dt><dd>{tenure(m.since, today)}</dd></div> : null}
          {stats.map(([label, value]) => <div key={label} className="flex justify-between gap-3"><dt className="text-muted-foreground">{label}</dt><dd className="tabular-nums">{value}</dd></div>)}
          <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Thank-yous</dt><dd className="tabular-nums">{m.kudos}</dd></div>
        </dl>
        <div>
          <div className="mb-1.5 text-xs font-medium text-muted-foreground">{client ? "Latest they developed for you" : "Latest they developed"}</div>
          {recent === null ? <p className="text-xs text-muted-foreground">Loading…</p> : recent === false ? (
            <p className="text-xs text-muted-foreground" data-profile-recent-failed>Couldn&apos;t load these. Close and open the profile to try again.</p>
          ) : recent.length ? (
            <ul className="space-y-1" data-profile-recent>
              {recent.map((r) => (
                <li key={`${r.leadId}-${r.at}`} className="flex items-center justify-between gap-2 text-sm">
                  <Link href={`/leads/${r.leadId}`} className="truncate hover:text-primary">{r.co}</Link>
                  <span className="shrink-0 text-xs text-muted-foreground">{r.kind === "appointment" ? "Appointment" : "Lead"} · {day(r.at)}</span>
                </li>
              ))}
            </ul>
          ) : <p className="text-xs text-muted-foreground">Nothing yet.</p>}
        </div>
        {!self ? (
          <div className="flex flex-wrap justify-end gap-2 pb-5">
            {m.birthday ? <Button size="sm" onClick={() => onAct("gift")}><Gift /> Send a gift</Button> : null}
            {canMessage ? <Button size="sm" variant="outline" onClick={() => onAct("message")}><MessageSquare /> Message</Button> : null}
            <Button size="sm" variant="ghost" onClick={() => onAct("thanks")}><Heart /> Thank</Button>
          </div>
        ) : <div className="pb-5" />}
      </DialogContent>
    </Dialog>
  );
}
