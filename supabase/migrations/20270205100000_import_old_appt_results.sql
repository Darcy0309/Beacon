-- The old system's appointment results, read right on import (Sean, Nov 2026):
--   "-$Appointment" and "-$Survey Appointment" were its invalid appointments: they come in as
--   Appointment-Invalid (they were read as Appointment, and counted as appointments).
--   "Appt From X-Date" is read on a DB dev project's column too, as on an appointment project's.
-- (An appointment result with no appointment date comes in as Lead-No Contact: src/features/imports/actions.js.)
--
-- Safe to run more than once.

-- Off Appointment.
update public.call_results
   set aliases = array(select a from unnest(aliases) a where a not in ('-$appointment', '-$survey appointment', '-$phone appointment', '-$appt from x-date'))
 where name = 'Appointment' and project_type in ('APPT', 'DBDV');

-- Onto Appointment-Invalid, on both kinds of project.
update public.call_results
   set aliases = array(select distinct a from unnest(coalesce(aliases, '{}') || array['-$appointment', '-$survey appointment', '-$phone appointment', '-$appt from x-date']) a order by a)
 where name = 'Appointment-Invalid' and project_type in ('APPT', 'DBDV');

-- "Appt From X-Date" on a DB dev project's column too.
update public.call_results
   set aliases = array(select distinct a from unnest(coalesce(aliases, '{}') || array['appt from x-date']) a order by a)
 where name = 'Appointment' and project_type = 'DBDV';
