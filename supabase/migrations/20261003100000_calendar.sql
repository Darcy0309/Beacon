-- ---------------------------------------------------------------------------
-- Lighthouse CRM — the date picker's appointment dots
--
-- When a date is picked for an appointment, each day of the month on show
-- carries a dot for every appointment already on it (up to three), so a rep
-- sees which days are filling up before choosing one.
--
-- Security invoker: Row Level Security decides which appointments count, as
-- everywhere else (a client counts only their own, once QA has passed them).
-- At most 93 days at a time: a month view shows six weeks.
-- ---------------------------------------------------------------------------

create or replace function public.appointment_day_counts(p_from date, p_to date)
returns table (day date, appointments bigint)
language sql stable security invoker set search_path = public as $$
  select a.appt_date, count(*)
    from public.appointments a
   where a.appt_date between p_from and least(p_to, p_from + 92)
     and a.invalid_at is null
   group by a.appt_date
   order by a.appt_date;
$$;

revoke execute on function public.appointment_day_counts(date, date) from public, anon;
grant execute on function public.appointment_day_counts(date, date) to authenticated;
