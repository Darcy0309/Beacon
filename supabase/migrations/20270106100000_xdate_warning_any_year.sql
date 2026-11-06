-- The X-date 30-day warning, whatever year the X-date carries (Sean, Nov 2026). The team goes by
-- the month and day: a rep may type 2027 for a December renewal developed today, and old records
-- keep a past year. Every other part of the app reads a renewal by its month (and day) already;
-- this warning matched the whole date, so it missed those. It now matches the month and day, a
-- Feb 29 renewal warned of on Feb 28 in a year without one.
--
--   renews_on(xdate, day)   whether an X-date falls on `day`'s month and day, any year
--
-- Safe to run more than once.

create or replace function public.renews_on(p_xdate date, p_day date)
returns boolean language sql immutable parallel safe set search_path = '' as $$
  select p_xdate is not null and (
    to_char(p_xdate, 'MM-DD') = to_char(p_day, 'MM-DD')
    -- Feb 28 in a year without a 29th stands for the 29th too.
    or (to_char(p_day, 'MM-DD') = '02-28' and to_char(p_day + 1, 'MM-DD') = '03-01' and to_char(p_xdate, 'MM-DD') = '02-29'))
$$;

do $$
declare
  v_def text := pg_get_functiondef('public.send_xdate_warnings(date)'::regprocedure);
begin
  if position('renews_on' in v_def) = 0 then
    if position('and coalesce(i.ultimate_xdate, least(' in v_def) = 0 or position('i.eo_xdate)) = v_due' in v_def) = 0 then
      raise exception 'send_xdate_warnings is not as expected';
    end if;
    v_def := replace(v_def, 'and coalesce(i.ultimate_xdate, least(', 'and public.renews_on(coalesce(i.ultimate_xdate, least(');
    v_def := replace(v_def, 'i.eo_xdate)) = v_due', 'i.eo_xdate)), v_due)');
    execute v_def;
  end if;
end $$;
