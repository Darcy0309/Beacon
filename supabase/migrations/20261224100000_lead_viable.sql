-- Lead-Viable (Sean, Oct 2026): "Lead-No Contact" read to clients as if the
-- business had never been called for them. A lead now starts at Lead-No
-- Contact and, once a manager has called it and it has not become an
-- appointment or been resolved, it is Lead-Viable: the leads called at least
-- once told from those not called yet, for clients, administrators and the
-- managers' call list filters.
--
--   Lead-Viable          new appointment-setting result: stays on the call
--                        lists, as Lead-No Contact does. Not a button: given
--                        by the call.
--   leads_lead_viable    a call recorded as Lead-No Contact, Lead-Left
--                        Message or Lead-Email (what happened on it, kept in
--                        the call history) leaves the lead at Lead-Viable.
--                        Results that say something of their own
--                        (Lead-ClientList, Lead-Not Shopping, Lead-Corrected)
--                        stay as titled; a result set without a call (Result
--                        Change, an import, a promotion, a transfer) is left
--                        as it is.
--   The leads already called: those at Lead-Left Message or Lead-Email, and
--   those at Lead-No Contact with a call on them at appointment setting,
--   become Lead-Viable (once).
--
-- Safe to run more than once.

insert into public.call_results
  (project_type, name, sort_order, viable, callable, sort_last, effect, pay_kind, applies_to, status_code, action, aliases)
values
  ('APPT', 'Lead-Viable', 15, true, true, false, 'none', null, 'report', 'xdate',
   'Called at least once, not yet an appointment or resolved. Stays on active Appt project call lists (tracked by # of calls made to each name/weighted)',
   array['lead viable', 'xd-viable'])
on conflict (project_type, name) do update set
  sort_order = excluded.sort_order, viable = excluded.viable, callable = excluded.callable,
  sort_last = excluded.sort_last, effect = excluded.effect, pay_kind = excluded.pay_kind,
  applies_to = excluded.applies_to, status_code = excluded.status_code,
  action = excluded.action, aliases = excluded.aliases;

/** A lead called and still to work: a call recorded as No Contact, Left Message or Email leaves it at Lead-Viable. */
create or replace function public.tg_leads_lead_viable() returns trigger
language plpgsql set search_path = public as $$
declare
  v_viable bigint;
begin
  if new.stage is distinct from 'appt' then
    return new;
  end if;
  if not exists (select 1 from public.call_results r
                  where r.id = new.result_id and r.project_type = 'APPT' and r.name in ('Lead-No Contact', 'Lead-Left Message', 'Lead-Email')) then
    return new;
  end if;
  -- Given by a call: record_call_result() records it, in this same transaction, before it sets the result.
  if not exists (select 1 from public.call_records c
                  where c.lead_id = new.id and c.result_id = new.result_id and c.stage = 'appt' and c.call_date = now()) then
    return new;
  end if;
  select id into v_viable from public.call_results where project_type = 'APPT' and name = 'Lead-Viable';
  if v_viable is not null then
    new.result_id := v_viable;
    new.call_result_appt := 'Lead-Viable';
  end if;
  return new;
end $$;
drop trigger if exists leads_lead_viable on public.leads;
create trigger leads_lead_viable before update of result_id on public.leads
  for each row execute function public.tg_leads_lead_viable();

-- The leads already called.
update public.leads l set
  result_id = v.id,
  call_result_appt = 'Lead-Viable'
  from public.call_results r, public.call_results v
 where l.result_id = r.id and l.stage = 'appt'
   and v.project_type = 'APPT' and v.name = 'Lead-Viable'
   and r.project_type = 'APPT'
   and (r.name in ('Lead-Left Message', 'Lead-Email')
        or (r.name = 'Lead-No Contact'
            and (l.call_weight > 0 or exists (select 1 from public.call_records c where c.lead_id = l.id and c.stage = 'appt'))));
