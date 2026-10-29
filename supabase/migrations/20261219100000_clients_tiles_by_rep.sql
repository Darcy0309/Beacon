-- The Clients page's tiles for one Sales Rep's clients (Oct 2026): picking a
-- Sales Rep in the Client Accounts list counts the Leads and Appointments
-- tiles (totals and charts) for the clients tied to that rep.
--
--   clients_totals(p_companies)        as before, for those clients only
--   clients_chart(p_from, p_to, p_companies)   when given; all active ones when null
--
-- The old signatures go (a call with fewer arguments takes the default).
-- Safe to run more than once.

drop function if exists public.clients_totals();
create or replace function public.clients_totals(p_companies bigint[] default null)
returns table(leads_active bigint, leads_resolved bigint, appointments bigint, invalid_appointments bigint)
language sql stable set search_path = public as $$
  select count(*) filter (where c.stage = 'appt' and c.viable),
         count(*) filter (where c.stage = 'appt' and not c.viable),
         count(*) filter (where c.effect in ('appointment', 'confirm')),
         count(*) filter (where c.effect = 'appointment_invalid')
    from public.lead_classes c
    join public.projects p on p.id = c.project_id
    join public.companies co on co.id = p.company_id
   where co.status = 'active'
     and (p_companies is null or co.id = any(p_companies));
$$;
revoke execute on function public.clients_totals(bigint[]) from public, anon;
grant execute on function public.clients_totals(bigint[]) to authenticated;

drop function if exists public.clients_chart(date, date);
create or replace function public.clients_chart(p_from date, p_to date, p_companies bigint[] default null)
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
       and (p_companies is null or co.id = any(p_companies))
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
revoke execute on function public.clients_chart(date, date, bigint[]) from public, anon;
grant execute on function public.clients_chart(date, date, bigint[]) to authenticated;
