-- SIC codes keep their leading zero (Sean, Oct 2026): the agricultural codes
-- (01-09) lost it in a spreadsheet, so the master list held "111" where a
-- lead (and the vendor) has "0111", and the lead page found no description;
-- "11101" read as 1110's. A code with an odd number of digits has lost its
-- zero: "1" is 01, "111" is 0111, "11101" is 011101, "111-01" is 0111-01.
--
--   1. sic_pad(code): the code with its zero back.
--   2. The codes on file put right: the master list (a padded code taking the
--      description when it has none), the leads and the clients; the unpadded
--      ones then go. Triggers are off while it runs, so no lead reads as
--      updated and nobody is told of anything.
--   3. From now on, whatever writes a code (an import, a form, SQL) has its
--      zero put back as it is saved.
--
-- Safe to run more than once. Run it in the SQL Editor before the code that
-- goes with it is pushed (the code works with either).

create or replace function public.sic_pad(c text) returns text
language sql immutable parallel safe set search_path = '' as $$
  select case
    when c ~ '^(\d|\d{3}|\d{5}|\d{7})$' then '0' || c
    when c ~ '^\d{3}-\d{2}$' then '0' || c
    else c
  end
$$;

begin;
set local session_replication_role = replica;

insert into public.sic_codes (code, description)
select public.sic_pad(code), description from public.sic_codes where public.sic_pad(code) <> code
on conflict (code) do update set description = coalesce(public.sic_codes.description, excluded.description);

update public.leads set sic_code = public.sic_pad(sic_code) where sic_code is not null and public.sic_pad(sic_code) <> sic_code;
update public.companies set sic_code = public.sic_pad(sic_code) where sic_code is not null and public.sic_pad(sic_code) <> sic_code;

delete from public.sic_codes where public.sic_pad(code) <> code;
commit;

create or replace function public.tg_sic_pad() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_table_name = 'sic_codes' then
    new.code := public.sic_pad(new.code);
  else
    new.sic_code := public.sic_pad(new.sic_code);
  end if;
  return new;
end
$$;

drop trigger if exists sic_pad on public.sic_codes;
create trigger sic_pad before insert or update of code on public.sic_codes
  for each row execute function public.tg_sic_pad();
drop trigger if exists sic_pad on public.leads;
create trigger sic_pad before insert or update of sic_code on public.leads
  for each row execute function public.tg_sic_pad();
drop trigger if exists sic_pad on public.companies;
create trigger sic_pad before insert or update of sic_code on public.companies
  for each row execute function public.tg_sic_pad();
