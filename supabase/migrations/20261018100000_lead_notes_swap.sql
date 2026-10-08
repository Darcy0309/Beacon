-- ---------------------------------------------------------------------------
-- Lighthouse CRM — a lead's two notes, as the client uses them (Sean, Oct 2026)
--
--   Client notes    leads.client_note: what the client sees (the lead sheet
--                   email, the calendar). The note a list imported as its
--                   "Notes" (lead_notes.notes_dcm, shown as "Internal notes")
--                   is the client's note in their system, so it joins it.
--   Internal notes  lead_notes.notes: staff only, never shown to a client.
--                   What was the old system's notes (lead_notes.notes_client,
--                   its call history).
--
-- Run once; a second run finds nothing left to move.
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'lead_notes' and column_name = 'notes_dcm') then
    -- Into the client notes: after what is there, unless it is there already.
    update public.leads l
       set client_note = case when nullif(btrim(coalesce(l.client_note, '')), '') is null then btrim(n.notes_dcm)
                              else l.client_note || E'\n' || btrim(n.notes_dcm) end
      from public.lead_notes n
     where n.lead_id = l.id
       and nullif(btrim(coalesce(n.notes_dcm, '')), '') is not null
       and position(btrim(n.notes_dcm) in coalesce(l.client_note, '')) = 0;

    alter table public.lead_notes drop column notes_dcm;
    alter table public.lead_notes rename column notes_client to notes;
    delete from public.lead_notes where nullif(btrim(coalesce(notes, '')), '') is null;
  end if;
end $$;

comment on column public.lead_notes.notes is 'Internal notes: staff only, never shown to a client.';
comment on column public.leads.client_note is 'Client notes: what the client sees, in the lead sheet email and on the calendar.';
