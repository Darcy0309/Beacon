-- ---------------------------------------------------------------------------
-- Lighthouse CRM — a call list's filter lasts the day (Sean, Oct 2026)
--
-- A manager's filter for a project's call list stays through the day (a
-- lunch break, a restart) and is set aside the next morning, when the list
-- starts again in full; Clear all ends it sooner.
--
--   call_list()    as before, through the caller's filter only if it was set
--                  (or changed) today, on the business's clock
--   call_list_filters_touch   every save stamps updated_at
-- ---------------------------------------------------------------------------

/**
 * A rep's call list, as before (names still to call, least-called first,
 * searched word by word), through the caller's filter for the project,
 * if they set it today (the business's day), unless `p_filtered` is false.
 * `total` counts the names that pass it.
 */
create or replace function public.call_list(p_project_id bigint, p_rep bigint default null,
                                            p_limit int default 50, p_offset int default 0,
                                            p_search text default null, p_filtered boolean default true)
returns table (
  id bigint, company_name text, contact_name text, phone text, city text, state text,
  result text, call_weight int, sort_last boolean, date_last_worked timestamptz,
  renewal_date date, total bigint
)
language plpgsql stable security invoker set search_path = public, extensions as $$
declare
  v_rep   bigint := coalesce(p_rep, public.app_user_id());
  v_words text[] := public.search_words(p_search);
  v_pats  text[] := public.search_patterns(v_words);
  v_first text   := public.search_lead_pattern(v_words);
  v_c     jsonb;
begin
  if v_rep is distinct from public.app_user_id() and not public.is_manager() then
    raise exception 'You can only open your own call list' using errcode = '42501';
  end if;
  if coalesce(p_filtered, true) then
    -- Today's only: each morning the list starts again in full.
    select f.criteria into v_c from public.call_list_filters f
     where f.user_id = public.app_user_id() and f.project_id = p_project_id
       and (f.updated_at at time zone public.business_tz())::date = (now() at time zone public.business_tz())::date;
  end if;
  return query
    select l.id, l.company_name, l.contact_name, l.phone, l.city, l.state,
           r.name, l.call_weight, r.sort_last, l.date_last_worked,
           x.renewal, count(*) over ()
      from public.leads l
      join public.call_results r on r.id = l.result_id
      cross join lateral (select public.lead_renewal_date(l.id) as renewal) x
     where l.project_id = p_project_id
       and l.assigned_user_id = v_rep
       and r.viable and r.callable
       and (v_first is null or (l.search_text like v_first and l.search_text like all (v_pats)))
       and (v_c is null or v_c = '{}'::jsonb
            or public.call_list_matches(l, x.renewal,
                 case when v_c ? 'carrier' then public.lead_carrier_keys(l.id) else '{}'::text[] end, v_c))
     order by r.sort_last, l.call_weight, l.date_last_worked nulls first, l.id
     limit greatest(least(coalesce(p_limit, 50), 500), 1)
    offset greatest(coalesce(p_offset, 0), 0);
end $$;
revoke execute on function public.call_list(bigint, bigint, int, int, text, boolean) from public, anon;
grant execute on function public.call_list(bigint, bigint, int, int, text, boolean) to authenticated;

-- Saved is saved today: every change stamps the time, whoever writes it.
create or replace function public.tg_call_list_filters_touch()
returns trigger
language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists call_list_filters_touch on public.call_list_filters;
create trigger call_list_filters_touch
  before insert or update on public.call_list_filters
  for each row execute function public.tg_call_list_filters_touch();
