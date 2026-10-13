-- ---------------------------------------------------------------------------
-- Lighthouse CRM — appointment call results: Lead-CurrentClient and
-- Lead-ClientList (Sean, Oct 2026)
--
--   Lead-Client        is now Lead-CurrentClient: the same result (still
--                      "Removed from Appt project call lists"), renamed, so
--                      names that already have it and their call history
--                      read the new name. Lists that say Lead-Client or
--                      XD-Client still import as it.
--   Lead-ClientList    new: "Stays on active Appt project call lists
--                      (tracked by # of calls made to each name/weighted).
--                      Viewable results stays as titled".
-- ---------------------------------------------------------------------------

-- The rename, once: where a result's name is written out, it follows.
update public.leads l set call_result_appt = 'Lead-CurrentClient'
  from public.call_results r
 where r.project_type = 'APPT' and r.name = 'Lead-Client' and l.result_id = r.id and l.call_result_appt = 'Lead-Client';
update public.call_records c set call_result = 'Lead-CurrentClient'
  from public.call_results r
 where r.project_type = 'APPT' and r.name = 'Lead-Client' and c.result_id = r.id and c.call_result = 'Lead-Client';
update public.call_results set name = 'Lead-CurrentClient'
 where project_type = 'APPT' and name = 'Lead-Client';
update public.call_results
   set aliases = array['xd-client', 'lead-client', 'xd-current client', 'xd-currentclient', 'lead-current client', 'current client']
 where project_type = 'APPT' and name = 'Lead-CurrentClient';

insert into public.call_results
  (project_type, name, sort_order, viable, callable, sort_last, effect, pay_kind, applies_to, status_code, action, aliases)
values
  ('APPT', 'Lead-ClientList', 35, true, true, false, 'none', null, 'name', 'xdate',
   'Stays on active Appt project call lists (tracked by # of calls made to each name/weighted). Viewable results stays as titled',
   array['xd-client list', 'xd-clientlist', 'lead-client list', 'client list', 'clientlist'])
on conflict (project_type, name) do update set
  sort_order = excluded.sort_order, viable = excluded.viable, callable = excluded.callable,
  sort_last = excluded.sort_last, effect = excluded.effect, pay_kind = excluded.pay_kind,
  applies_to = excluded.applies_to, status_code = excluded.status_code,
  action = excluded.action, aliases = excluded.aliases;
