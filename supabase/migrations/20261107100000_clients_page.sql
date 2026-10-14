-- The Clients page (Sean, Oct 2026): clients listed in rows with their state,
-- time zone, start and end dates and a status of Active, Paused or
-- Completed; and tiles for the active clients' leads and appointments, each
-- with a chart over time.
--
--   companies.status     active, paused or completed (inactive becomes paused)
--   clients_totals()     the active clients' leads and appointments, counted
--                        by call result as a client's own page counts them
--   clients_chart()      leads and appointments developed for active clients,
--                        by the day (and by the hour for a single day)
--
-- A client's time zone, start date and end date were already columns
-- (timezone_id, subscription_start, subscription_end): the form now fills them.
--
-- Safe to run again.

-- --- Status: Active, Paused, Completed --------------------------------------
-- 'inactive' stays allowed until the app that still offers it is replaced.
alter table public.companies drop constraint if exists companies_status_check;
update public.companies set status = 'paused' where status = 'inactive';
alter table public.companies add constraint companies_status_check
  check (status in ('active', 'paused', 'completed', 'inactive'));

-- --- The active clients' leads and appointments, by call result -------------
-- Runs as the person asking: Row Level Security hides what is deleted, and
-- staff see every client.
create or replace function public.clients_totals()
returns table (leads_active bigint, leads_resolved bigint, appointments bigint, invalid_appointments bigint)
language sql stable security invoker set search_path = public as $$
  select count(*) filter (where c.stage = 'appt' and c.viable),
         count(*) filter (where c.stage = 'appt' and not c.viable),
         count(*) filter (where c.effect in ('appointment', 'confirm')),
         count(*) filter (where c.effect = 'appointment_invalid')
    from public.lead_classes c
    join public.projects p on p.id = c.project_id
    join public.companies co on co.id = p.company_id
   where co.status = 'active';
$$;
revoke execute on function public.clients_totals() from public, anon;
grant execute on function public.clients_totals() to authenticated;

-- --- Leads and appointments developed for active clients, over time ---------
-- What the team's production chart counts (a lead or an appointment paid
-- for, not charged back), for the projects of active clients. A manager's
-- own pay events are all Row Level Security shows them, so this reads with
-- the database's rights, for administrators and managers only, and leaves
-- deleted clients and projects out itself.
create or replace function public.clients_chart(p_from date, p_to date)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_tz text := public.business_tz();
  v_lo timestamptz;
  v_hi timestamptz;
  v    jsonb;
begin
  if not public.is_manager() then
    raise exception 'Only administrators and managers see every client''s production' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 731 then
    raise exception 'Choose up to two years' using errcode = '22023';
  end if;
  v_lo := p_from::timestamp at time zone v_tz;
  v_hi := (p_to + 1)::timestamp at time zone v_tz;

  with ev as (
    select (pe.created_at at time zone v_tz)::date as d, extract(hour from pe.created_at at time zone v_tz)::int as h, pe.kind
      from public.pay_events pe
      join public.projects p on p.id = pe.project_id and p.deleted_at is null
      join public.companies co on co.id = p.company_id and co.deleted_at is null and co.status = 'active'
     where pe.kind in ('lead', 'appointment') and not pe.is_chargeback
       and pe.created_at >= v_lo and pe.created_at < v_hi
  )
  select jsonb_build_object(
    'days', coalesce((
      select jsonb_agg(jsonb_build_object('day', d, 'leads', l, 'appts', a) order by d)
        from (select d, count(*) filter (where kind = 'lead') as l, count(*) filter (where kind = 'appointment') as a
                from ev group by d) q), '[]'::jsonb),
    'hours', case when p_from = p_to then coalesce((
      select jsonb_agg(jsonb_build_object('hour', h, 'leads', l, 'appts', a) order by h)
        from (select h, count(*) filter (where kind = 'lead') as l, count(*) filter (where kind = 'appointment') as a
                from ev group by h) q), '[]'::jsonb) end)
  into v;
  return v;
end $$;
revoke execute on function public.clients_chart(date, date) from public, anon;
grant execute on function public.clients_chart(date, date) to authenticated;
