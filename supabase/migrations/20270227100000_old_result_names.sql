-- The old system's call results, as Sean's test import showed them (Nov 2026):
--
--   "Call 0" … "Call 9"   a name called that many times with no contact: Viable-No Contact (now Viable-CallBack)
--                         on a DB Dev list; "XD-Call 0" … "XD-Call 9", Lead-No Contact on an appointment list.
--   "X-Date-Lead"         a lead: Lead-Hot Lead, as "X-Date Hot Lead" ("should be importing as Lead-Hot Lead").
--
-- Each old name belongs to one result of its kind of list: taken off any other first. Results are found by
-- their name or the old names they already answer to, so one renamed in Settings is still found.
-- Safe to run more than once.

do $$
declare
  v_calls text[] := array(select 'call ' || i from generate_series(0, 9) i)
                 || array(select 'call' || i from generate_series(0, 9) i)
                 || array(select 'call-' || i from generate_series(0, 9) i);
  v_xd_calls text[] := array(select 'xd-call ' || i from generate_series(0, 9) i)
                    || array(select 'xd call ' || i from generate_series(0, 9) i)
                    || array(select 'xd-call' || i from generate_series(0, 9) i);
  v_lead text[] := array['x-date-lead', 'x-date lead', 'xdate lead', 'xdate-lead'];
  v_target bigint;
begin
  -- DB Dev: Call 0–9.
  select id into v_target from public.call_results
   where project_type = 'DBDV' and (name in ('Viable-CallBack', 'Viable-No Contact') or 'viable-no contact' = any (aliases))
   order by (name = 'Viable-CallBack') desc limit 1;
  if v_target is not null then
    update public.call_results set aliases = array(select a from unnest(aliases) a where a <> all (v_calls))
     where project_type = 'DBDV' and id <> v_target and aliases && v_calls;
    update public.call_results set aliases = array(select distinct a from unnest(aliases || v_calls) a order by a) where id = v_target;
  end if;

  -- Appointment lists: XD-Call 0–9.
  select id into v_target from public.call_results
   where project_type = 'APPT' and (name = 'Lead-No Contact' or 'lead no contact' = any (aliases))
   order by (name = 'Lead-No Contact') desc limit 1;
  if v_target is not null then
    update public.call_results set aliases = array(select a from unnest(aliases) a where a <> all (v_xd_calls))
     where project_type = 'APPT' and id <> v_target and aliases && v_xd_calls;
    update public.call_results set aliases = array(select distinct a from unnest(aliases || v_xd_calls) a order by a) where id = v_target;
  end if;

  -- DB Dev: X-Date-Lead is a Lead-Hot Lead.
  select id into v_target from public.call_results
   where project_type = 'DBDV' and (name = 'Lead-Hot Lead' or 'x-date hot lead' = any (aliases))
   order by (name = 'Lead-Hot Lead') desc limit 1;
  if v_target is not null then
    update public.call_results set aliases = array(select a from unnest(aliases) a where a <> all (v_lead))
     where project_type = 'DBDV' and id <> v_target and aliases && v_lead;
    update public.call_results set aliases = array(select distinct a from unnest(aliases || v_lead) a order by a) where id = v_target;
  end if;
end $$;
