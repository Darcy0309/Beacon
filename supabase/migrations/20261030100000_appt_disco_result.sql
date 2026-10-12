-- ---------------------------------------------------------------------------
-- Lighthouse CRM — Lead-Disco# on appointment projects (Sean, Oct 2026)
--
-- A disconnected number found while calling an appointment project's names:
-- "Removed from Appt project call lists", as DB dev's Disco# does there.
-- Old-system lists that say XD-Disco# (or disconnected) import as it.
-- ---------------------------------------------------------------------------

insert into public.call_results
  (project_type, name, sort_order, viable, callable, sort_last, effect, pay_kind, applies_to, status_code, action, aliases)
values
  ('APPT', 'Lead-Disco#', 115, false, true, false, 'none', null, 'name', 'disconnected',
   'Removed from Appt project call lists',
   array['xd-disco#', 'xd-disco', 'xd-disconnected', 'lead-disco#', 'lead-disco', 'disco#', 'disco', 'disconnected', 'disconnected #'])
on conflict (project_type, name) do update set
  sort_order = excluded.sort_order, viable = excluded.viable, callable = excluded.callable,
  sort_last = excluded.sort_last, effect = excluded.effect, pay_kind = excluded.pay_kind,
  applies_to = excluded.applies_to, status_code = excluded.status_code,
  action = excluded.action, aliases = excluded.aliases;
