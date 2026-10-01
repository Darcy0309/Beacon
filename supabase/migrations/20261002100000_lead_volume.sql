-- ---------------------------------------------------------------------------
-- Lighthouse CRM — lead volume over a chosen period
--
-- The dashboard's Lead Volume chart showed a fixed eight weeks. It now offers
-- one, two, six or twelve months; this returns new leads per day over the
-- last year (only days that have any), and the chart groups them into days,
-- weeks or months for the period picked, without another round trip.
--
-- Security invoker: Row Level Security scopes the counts to what the caller
-- may see, like every other dashboard figure.
-- ---------------------------------------------------------------------------

create or replace function public.lead_volume_daily(p_days int default 366)
returns jsonb
language sql stable security invoker set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('day', t.day, 'leads', t.n) order by t.day), '[]'::jsonb)
    from (
      select (coalesce(l.lead_date, l.created_at) at time zone 'UTC')::date as day, count(*) as n
        from public.leads l
       where coalesce(l.lead_date, l.created_at) >= now() - make_interval(days => least(greatest(coalesce(p_days, 366), 1), 800))
       group by 1
    ) t;
$$;

revoke execute on function public.lead_volume_daily(int) from public, anon;
grant execute on function public.lead_volume_daily(int) to authenticated;
