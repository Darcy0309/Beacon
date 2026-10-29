-- Blocked time that repeats every week (Sean, Oct 2026): a client blocks
-- out, say, every Tuesday and Thursday for the next two months (all day, or
-- a time of day), as one block, for those who don't sync a calendar.
--
--   calendar_blocks.weekdays   the days of the week it applies on (0 Sunday
--                              to 6 Saturday), from its first day to its
--                              last; none: every day between them
--
-- Safe to run more than once.

alter table public.calendar_blocks add column if not exists weekdays smallint[];
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'calendar_blocks_weekdays_check') then
    alter table public.calendar_blocks add constraint calendar_blocks_weekdays_check
      check (weekdays is null or (cardinality(weekdays) between 1 and 7 and weekdays <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]));
  end if;
end $$;
