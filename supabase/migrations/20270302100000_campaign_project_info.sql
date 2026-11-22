-- Campaign Types, phase 2 (Sean, Nov 2026): a campaign type's own Project Info questions, answered per project.
-- (Its renamed and turned-off parts live on the type itself, campaign_types.fields.) Safe to run more than once.

alter table public.project_profiles add column if not exists custom jsonb not null default '{}'::jsonb;

-- The server's own role reads the campaign types too: a lead sheet emailed to the client, and Project Info saved
-- (from the app or the client's link), are laid out by them.
grant select, insert, update, delete on public.campaign_types to service_role;

notify pgrst, 'reload schema';
