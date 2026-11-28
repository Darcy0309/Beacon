"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "@/components/shared/intent-link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { UserPlus, Pencil, Wand2, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
// The app's own calendar, not the browser's (Nov 2026: the date of birth and start date opened the system one).
import DatePicker from "@/components/shared/date-picker";
import { Field, Select, formHelpers } from "@/components/ui/field";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { saveUser } from "@/features/users/actions";
import { ROLES } from "@/lib/nav";
import { PAY_MODELS, usd } from "@/lib/pay";
import { useDialogOpen } from "@/components/shared/row-edit-context";
import { generateTempPassword } from "@/lib/temp-password";

const EMPTY = { ok: false, data: null, error: null, fieldErrors: null, values: null };

/** `pay`: how they are paid ({ model, rate }); `hourly`: the hourly range from Settings. */
export default function UserForm({ user, options, pay, hourly, trigger }) {
  const isEdit = Boolean(user?.id);
  // Inside a row's action menu the menu owns the open state and there is no trigger.
  const [open, setOpen, inRowMenu, onCloseAutoFocus] = useDialogOpen();
  const router = useRouter();
  const [state, formAction, pending] = useActionState(saveUser, EMPTY);

  // Track role locally so the company field can be marked required for clients,
  // and pay shows only for the people who are paid (account managers and agents).
  // The role picked (Sean, Nov 2026: "Signature will never have agents"): Administrator, Account Manager, Client (a
  // client's own login: all its projects) or Agent (one of a client's agents: a Client login kept to the projects
  // ticked). An account still on the old staff Agent role keeps it until it is changed.
  const choiceOf = (r, scope) => (r === "client" && scope === "only" ? "client_agent" : r || "manager");
  const [choice, setChoice] = useState(choiceOf(user?.role, user?.project_scope));
  const role = choice === "client_agent" ? "client" : choice;
  const scope = choice === "client_agent" ? "only" : "all";
  const [payModel, setPayModel] = useState(pay?.model ?? "commission");
  // A new account: an emailed invitation, or a temporary password given to them.
  // Nothing emailed to begin with (Sean, Nov 2026: setting up clients' accounts before go-live, the
  // invitations went out): Send invitation from their row when it's time.
  const [access, setAccess] = useState("later");
  // A client login: its client, and all of its projects or only those ticked (Sean, Nov 2026: a client's
  // producers each see the projects the client buys for them).
  const savedPicks = (user?.picks ?? []).map((p) => String(p.project_id));
  const [companyId, setCompanyId] = useState(String(user?.company?.id ?? ""));
  const [picks, setPicks] = useState(savedPicks);
  useEffect(() => {
    if (!open) return;
    setCompanyId(String(user?.company?.id ?? ""));
    setChoice(choiceOf(user?.role, user?.project_scope));
    setPicks(savedPicks);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const [temp, setTemp] = useState("");

  useEffect(() => {
    if (state?.ok) {
      toast.success(
        isEdit ? "User updated"
          : state.data?.later ? `${state.data.email} is set up. Nothing was emailed: Send invitation from their row when it's time.`
          : state.data?.temporary ? `Account created for ${state.data.email}. Give them their temporary password.`
          : `Invitation sent to ${state.data?.email ?? "them"}`,
        state.data?.emailed ? { description: state.data.emailed } : undefined
      );
      setOpen(false);
      router.refresh();
    } else if (state?.error && !state?.fieldErrors) {
      toast.error(state.error);
    }
  }, [state, isEdit, router, setOpen]);

  // After a save, React resets the form to what the action sent back (or to
  // the saved record); the parts shown for a role or for hybrid pay follow
  // the fields, so the form never shows hybrid fields under "Commission only".
  useEffect(() => {
    if (state === EMPTY) return;
    setChoice(state?.values?.role ? choiceOf(state.values.role, state.values.project_scope) : choiceOf(user?.role, user?.project_scope));
    if (state?.values?.company_id !== undefined) setCompanyId(String(state.values.company_id ?? ""));
    setPayModel(state?.values?.pay_model || pay?.model || "commission");
  }, [state, user?.role, user?.project_scope, pay?.model]);

  const { companies = [], projects = [] } = options ?? {};
  const theirProjects = projects.filter((p) => String(p.company_id) === companyId);
  const record = {
    ...(user ? { ...user, company_id: user.company?.id ?? "" } : { role: "manager", status: "invited" }),
    pay_model: pay?.model ?? "commission",
    hourly_rate: pay?.rate == null ? "" : Number(pay.rate).toFixed(2),
    bonus_plan: pay?.plan ?? "",
    appointment_rate: pay?.apptRate == null ? "" : Number(pay.apptRate).toFixed(2),
    confirmation_rate: pay?.confRate == null ? "" : Number(pay.confRate).toFixed(2),
  };
  const paid = role === "manager" || role === "agent";
  const { fe, invalid, dv } = formHelpers(state, record);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {inRowMenu ? null : (
        <DialogTrigger asChild>
          {trigger ?? (
            <Button size="sm">{isEdit ? <Pencil /> : <UserPlus />} {isEdit ? "Edit" : "Add user"}</Button>
          )}
        </DialogTrigger>
      )}
      <DialogContent onCloseAutoFocus={onCloseAutoFocus}>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit user" : "Add user"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Changing the role or client account takes effect on their next request. Disabled accounts cannot sign in or read anything."
              : "Set them up now and email them nothing yet, email them an invitation link, or give them a temporary password. Either way they choose their own password when they first sign in."}
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} noValidate className="flex flex-col gap-4">
          {isEdit && <input type="hidden" name="id" value={user.id} />}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="First name" error={fe("first_name")}>
              <Input name="first_name" defaultValue={dv("first_name")} maxLength={40} aria-invalid={invalid("first_name")} autoFocus />
            </Field>
            <Field label="Last name" error={fe("last_name")}>
              <Input name="last_name" defaultValue={dv("last_name")} maxLength={40} aria-invalid={invalid("last_name")} />
            </Field>

            <Field label="Email" required error={fe("email")} className="sm:col-span-2">
              <Input name="email" type="email" inputMode="email" required defaultValue={dv("email")} maxLength={120} aria-invalid={invalid("email")} />
            </Field>

            {!isEdit ? (
              <fieldset className="space-y-2 rounded-lg border border-[var(--panel-border)] p-3 sm:col-span-2" data-access>
                <legend className="px-1 text-xs font-medium text-muted-foreground">How they get in</legend>
                <input type="hidden" name="access" value={access} />
                <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="How they get in">
                  {[["later", "Don't email them yet"], ["invite", "Email an invitation link"], ["password", "Set a temporary password"]].map(([key, label]) => (
                    <button key={key} type="button" role="radio" aria-checked={access === key} data-access-choice={key}
                      onClick={() => { setAccess(key); if (key === "password" && !temp) setTemp(generateTempPassword()); }}
                      className={access === key
                        ? "rounded-md border border-primary bg-primary/15 px-3 py-1.5 text-xs font-medium text-primary"
                        : "rounded-md border border-[var(--panel-border)] px-3 py-1.5 text-xs text-muted-foreground hover:border-primary/40 hover:text-foreground"}>
                      {label}
                    </button>
                  ))}
                </div>
                {access === "later" ? (
                  <p className="text-xs text-muted-foreground" data-access-later>
                    Nothing is emailed. When it&apos;s time, Send invitation from their row in Users emails them the link.
                  </p>
                ) : null}
                {access === "password" ? (
                  <>
                    <Field label="Temporary password" required error={fe("temp_password")}
                      hint="Give it to them by phone or text, not email. They choose their own when they first sign in.">
                      <div className="flex gap-2">
                        <Input name="temp_password" value={temp} onChange={(e) => setTemp(e.target.value)} maxLength={72} autoComplete="off"
                          spellCheck={false} className="font-mono" aria-invalid={invalid("temp_password")} />
                        <Button type="button" variant="outline" size="sm" className="h-9 shrink-0" onClick={() => setTemp(generateTempPassword())} aria-label="Generate a password"><Wand2 /></Button>
                        <Button type="button" variant="outline" size="sm" className="h-9 shrink-0" aria-label="Copy the password"
                          onClick={() => (navigator.clipboard?.writeText(temp) ?? Promise.reject()).then(() => toast.success("Copied"), () => toast.error("Couldn't copy it. Select the password and copy it by hand."))}><Copy /></Button>
                      </div>
                    </Field>
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" name="send_link" className="size-4 accent-[var(--primary)]" />
                      Email them a sign-in link (without the password)
                    </label>
                  </>
                ) : null}
              </fieldset>
            ) : null}

            {/* Agents are always a client's (Sean, Nov 2026): Agent saves as a Client login kept to the projects ticked. */}
            <Field label="Role" required error={fe("role")}
              hint={choice === "client" ? "The client's own login: every project the client is paying for, new ones too."
                : choice === "client_agent" ? "One of a client's agents: only the projects you tick below."
                : choice === "agent" ? "The old staff Agent role, no longer used: choose another." : undefined}>
              <input type="hidden" name="role" value={role} />
              <input type="hidden" name="project_scope" value={scope} />
              <Select value={choice} onChange={(e) => setChoice(e.target.value)} aria-invalid={invalid("role")} aria-label="Role" data-role-select>
                <option value="admin">{ROLES.admin.label}</option>
                <option value="manager">{ROLES.manager.label}</option>
                <option value="client">Client</option>
                <option value="client_agent">Agent</option>
                {user?.role === "agent" ? <option value="agent">Agent (old staff role)</option> : null}
              </Select>
            </Field>
            <Field label="Status" error={fe("status")} hint={isEdit ? "Disabled: signed out and locked out until re-enabled." : "New accounts start as Invited."}>
              {isEdit ? (
                <Select name="status" defaultValue={dv("status", "invited")} aria-invalid={invalid("status")}>
                  <option value="active">Active</option>
                  {/* Invited is where an account starts, not somewhere it can be put back. */}
                  {user?.status === "invited" ? <option value="invited">Invited</option> : null}
                  <option value="disabled">Disabled</option>
                </Select>
              ) : (
                <>
                  <input type="hidden" name="status" value="invited" />
                  <Input value="Invited until they sign in" disabled />
                </>
              )}
            </Field>

            <Field label="Username" error={fe("username")} hint="3–25 letters, numbers, . _ -">
              <Input name="username" defaultValue={dv("username")} maxLength={25} autoCapitalize="off" aria-invalid={invalid("username")} />
            </Field>
            <Field label="Work phone" error={fe("phone")} hint="With the extension below, it signs their lead emails">
              <Input name="phone" type="tel" inputMode="tel" defaultValue={dv("phone")} aria-invalid={invalid("phone")} />
            </Field>
            <Field label="Extension" error={fe("phone_ext")}>
              <Input name="phone_ext" inputMode="numeric" maxLength={8} defaultValue={dv("phone_ext")} aria-invalid={invalid("phone_ext")} />
            </Field>
            <Field label="Mobile" error={fe("mobile")}>
              <Input name="mobile" type="tel" inputMode="tel" defaultValue={dv("mobile")} aria-invalid={invalid("mobile")} />
            </Field>
            <Field label="State" error={fe("state")} hint="Where they work, e.g. AZ">
              <Input name="state" maxLength={20} defaultValue={dv("state")} aria-invalid={invalid("state")} />
            </Field>
            <Field label="Time zone" error={fe("timezone_id")}>
              <Select name="timezone_id" defaultValue={String(dv("timezone_id", "") ?? "")} aria-invalid={invalid("timezone_id")}>
                <option value="">—</option>
                {(options?.timezones ?? []).map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
              </Select>
            </Field>
            <Field label="Date of birth" error={fe("birth_date")} hint="A birthday note goes to the team that day">
              <DatePicker name="birth_date" defaultValue={dv("birth_date") ?? ""} max="today" invalid={invalid("birth_date")} aria-label="Date of birth" display="numeric" />
            </Field>
            <Field label="Started" error={fe("start_date")} hint="Their hire date: a work anniversary note goes to the team each year">
              <DatePicker name="start_date" defaultValue={dv("start_date") ?? ""} invalid={invalid("start_date")} aria-label="Start date" display="numeric" />
            </Field>

            <Field
              label="Client account"
              required={role === "client"}
              error={fe("company_id")}
              className="sm:col-span-2"
              hint={role === "client"
                ? (companies.length ? "Client users only see this account's projects." : null)
                : "Leave blank for internal staff."}
            >
              <Select name="company_id" defaultValue={dv("company_id")} onChange={(e) => { setCompanyId(e.target.value); setPicks([]); }} aria-invalid={invalid("company_id")}>
                <option value="">{role === "client" ? "Choose the client…" : "Internal staff — no client"}</option>
                {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
              {/* A client user belongs to a client: with none yet, say where to add one first. */}
              {role === "client" && !companies.length ? (
                <p className="mt-1.5 text-xs text-amber-600 dark:text-amber-400" data-no-clients>
                  No clients yet. Add the client on the <Link href="/clients" className="font-semibold underline">Clients</Link> page first,
                  then add their users here.
                </p>
              ) : null}
            </Field>

            {/* Which of the client's projects this login sees (Sean, Nov 2026): the client (the parent account)
                all of them; a producer of theirs only the projects bought for them. */}
            {choice === "client_agent" ? (
              <fieldset className="space-y-2 rounded-lg border border-[var(--panel-border)] p-3 sm:col-span-2" data-project-scope-field>
                <legend className="px-1 text-xs font-semibold">Projects they see</legend>
                <p className="text-xs text-muted-foreground">Only the projects ticked. A new project of the client&apos;s isn&apos;t added until you tick it.</p>
                {scope === "only" ? (
                  !companyId ? <p className="text-xs text-muted-foreground">Choose the client account first.</p>
                  : !theirProjects.length ? <p className="text-xs text-amber-600 dark:text-amber-400">This client has no projects yet.</p>
                  : (
                    <div className="max-h-48 space-y-1 overflow-y-auto rounded-md bg-muted/30 p-2" data-project-picks>
                      {theirProjects.map((p) => (
                        <label key={p.id} className="flex items-center gap-2 text-sm">
                          <input type="checkbox" name="project_ids" value={p.id} checked={picks.includes(String(p.id))} className="size-4 accent-[var(--primary)]"
                            onChange={(e) => setPicks((x) => (e.target.checked ? [...x, String(p.id)] : x.filter((v) => v !== String(p.id))))} />
                          <span className="truncate">{p.name}</span>
                        </label>
                      ))}
                    </div>
                  )
                ) : null}
                {fe("project_ids") ? <p className="text-xs text-destructive" role="alert">{fe("project_ids")}</p> : null}
              </fieldset>
            ) : null}

            {paid ? (
              <>
                <Field label="Pay" error={fe("pay_model")} className="sm:col-span-2"
                  hint={payModel === "hybrid" ? "Each pay period: their hours at this rate, or their commission, whichever is higher." : "Lead, appointment and confirmation pay at each project's rates, and Special Pay on a DB dev lead goal."}>
                  <Select name="pay_model" defaultValue={dv("pay_model")} onChange={(e) => setPayModel(e.target.value)} aria-invalid={invalid("pay_model")}>
                    {PAY_MODELS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </Select>
                </Field>
                {payModel === "hybrid" ? (
                  <Field label="Hourly rate ($)" required error={fe("hourly_rate")}
                    hint={hourly ? `Between ${usd(hourly.min)} and ${usd(hourly.max)} (Settings › Pay & time).` : undefined}>
                    <Input name="hourly_rate" type="number" inputMode="decimal" step="0.01" min={hourly?.min} max={hourly?.max}
                      defaultValue={dv("hourly_rate")} aria-invalid={invalid("hourly_rate")} />
                  </Field>
                ) : null}
                {/* Sean, Nov 2026: a manager's own appointment and confirmation pay on every project, and their bonus plan. */}
                <Field label="Their appointment pay ($)" error={fe("appointment_rate")} hint="On every project, in place of its rate. Blank: each project's.">
                  <Input name="appointment_rate" type="number" inputMode="decimal" step="0.01" min={0} placeholder="Project's rate"
                    defaultValue={dv("appointment_rate")} aria-invalid={invalid("appointment_rate")} data-appointment-rate />
                </Field>
                <Field label="Their confirmation pay ($)" error={fe("confirmation_rate")} hint="Blank: each project's.">
                  <Input name="confirmation_rate" type="number" inputMode="decimal" step="0.01" min={0} placeholder="Project's rate"
                    defaultValue={dv("confirmation_rate")} aria-invalid={invalid("confirmation_rate")} data-confirmation-rate />
                </Field>
                <Field label="Bonus plan" error={fe("bonus_plan")} className="sm:col-span-2"
                  hint="Lead manager: units each half of the pay period. Appointment manager: valid appointments each half and each month. The tiers are in Settings › Bonus plans.">
                  <Select name="bonus_plan" defaultValue={dv("bonus_plan")} aria-invalid={invalid("bonus_plan")} data-bonus-plan>
                    <option value="">No bonus plan</option>
                    <option value="lead">Lead manager</option>
                    <option value="appointment">Appointment manager</option>
                  </Select>
                </Field>
              </>
            ) : null}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={pending}>
              {pending ? (isEdit ? "Saving…" : "Working…") : isEdit ? "Save changes" : access === "invite" ? "Send invitation" : "Create account"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
