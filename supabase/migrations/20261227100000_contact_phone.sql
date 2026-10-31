-- The contact's own phone (Sean, Oct 2026): the lead page lists each person
-- with their email, phone and mobile ("Contact Phone" beside Contact Email
-- and Contact Mobile), and the contact had only a mobile. The business's
-- main number stays the lead's phone.
--
--   leads.contact_phone   the contact's direct line
--   copy_name()           a lead copied to another project (a transfer, a
--                         move) takes it with it
--
-- Safe to run more than once.

alter table public.leads add column if not exists contact_phone text;

-- copy_name() lists the columns it copies: the new one goes beside the contact's mobile, once.
do $$
declare
  def text;
begin
  select pg_get_functiondef(p.oid) into def from pg_proc p where p.proname = 'copy_name' and p.pronamespace = 'public'::regnamespace;
  if def is null or def like '%contact_phone%' then
    return;
  end if;
  if (length(def) - length(replace(def, 'original_xdate, contact_mobile,', ''))) / length('original_xdate, contact_mobile,') <> 2 then
    raise warning 'contact phone: copy_name() is not as expected; a copied lead will not take the contact''s phone';
    return;
  end if;
  execute replace(def, 'original_xdate, contact_mobile,', 'original_xdate, contact_mobile, contact_phone,');
end $$;
