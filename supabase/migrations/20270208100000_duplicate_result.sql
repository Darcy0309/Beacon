-- Duplicate (Sean, Nov 2026): "There's a high probability that we call a business that will end up being a duplicate
-- and should be marked accordingly (a business is under a DBA and other biz name, one has a work phone and the other a
-- mobile #, neither record has a contact name…): it wouldn't be flagged as a duplicate unless we actually called."
--
--   Duplicate / Lead-Duplicate   a result for each stage, as Branch / Lead-Branch are: off the call lists,
--                                reported as resolved, a button to give on a call. Not put on the client's
--                                removal list: the business is still on the list, as its other record.
--   The old system's "Duplicate" / "XD-Duplicate" come in as them on an import.
--
-- Safe to run more than once.

insert into public.call_results
  (project_type, name, sort_order, viable, callable, sort_last, effect, pay_kind, applies_to, status_code, action, aliases, delivers, client_removal)
values
  ('DBDV', 'Duplicate', 125, false, true, false, 'none', null, 'name', 'removed',
   'Another record of a business already on the list. Removed from DBDev call lists and reported as resolved by result type for DBDev project',
   array['duplicate', 'dup', 'dupe'], false, null),
  ('APPT', 'Lead-Duplicate', 132, false, true, false, 'none', null, 'name', 'removed',
   'Another record of a business already on the list. Removed from Appt project call lists',
   array['xd-duplicate', 'lead-duplicate', 'lead duplicate', 'xd duplicate'], false, null)
on conflict (project_type, name) do update set
  sort_order = excluded.sort_order, viable = excluded.viable, callable = excluded.callable,
  sort_last = excluded.sort_last, effect = excluded.effect, pay_kind = excluded.pay_kind,
  applies_to = excluded.applies_to, status_code = excluded.status_code,
  action = excluded.action, aliases = excluded.aliases, delivers = excluded.delivers, client_removal = excluded.client_removal;
