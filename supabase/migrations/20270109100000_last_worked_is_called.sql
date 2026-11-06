-- Last worked is last called (Sean, Nov 2026): the Lead Explorer's Last worked (lead_explore's
-- last_worked) was the later of a lead's last call and its last change, so a list just imported, or
-- names brought over from the Match Tool, read as worked the day they came, while the lead's own page
-- said "Not yet". It is the last call only, as the lead's page and the Leads list have it: imported,
-- transferred or edited is not worked. Nothing else in lead_explore changes.
--
-- Safe to run more than once.

do $$
declare
  v_def text;
begin
  v_def := pg_get_functiondef('public.lead_explore(jsonb,integer,integer)'::regprocedure);
  if position('greatest(l.date_last_worked, l.updated_at) as last_worked' in v_def) > 0 then
    execute replace(v_def, 'greatest(l.date_last_worked, l.updated_at) as last_worked', 'l.date_last_worked as last_worked');
  elsif position('l.date_last_worked as last_worked' in v_def) = 0 then
    raise exception 'lead_explore is not as expected: its last_worked is neither the later of call and change nor the last call';
  end if;
end $$;
