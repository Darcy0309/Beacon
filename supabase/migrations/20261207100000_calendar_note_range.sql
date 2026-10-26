-- =============================================================================
-- A calendar note over a stretch of time (Oct 2026): dragging across the hours
-- of the calendar's day or week opens a note for that time, from and until.
-- until_time is optional: a note on a single time (as before) has none.
-- =============================================================================

alter table public.calendar_notes add column if not exists until_time time;
alter table public.calendar_notes drop constraint if exists calendar_notes_until_after;
alter table public.calendar_notes add constraint calendar_notes_until_after check (until_time is null or until_time > at_time);
comment on column public.calendar_notes.until_time is 'Where the note''s time ends (null: a note on its one time, at_time)';
