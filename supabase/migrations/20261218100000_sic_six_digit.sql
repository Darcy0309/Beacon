-- One form for a 6-digit SIC code (Oct 2026). The client's SIC sheets (the
-- old one, and the 2-, 4- and 6-digit tabs they mean to load now) write
-- 422505; SalesGenie writes 4225-05. Both are one code, so a lead from a
-- SalesGenie list finds its description in the list, and the list doesn't
-- gain a dashed copy of every code an import brings. The code is kept
-- without its dash, as the client's sheets have it.
--
--   1. sic_pad(code): also "4225-05" is 422505, and "111-01" (a lost zero) 011101.
--   2. The codes on file put right, as the leading zeros were: the master list
--      (the dashless code taking the description when it has none), the leads
--      and the clients; the dashed ones then go. Triggers are off while it
--      runs, so no lead reads as updated and nobody is told of anything.
--
-- The triggers that call sic_pad() on every write are already there
-- (…_sic_leading_zeros.sql). Safe to run more than once.

create or replace function public.sic_pad(c text) returns text
language sql immutable parallel safe set search_path = '' as $$
  select case
    when c ~ '^\d{4}-\d{2}$' then replace(c, '-', '')
    when c ~ '^\d{3}-\d{2}$' then '0' || replace(c, '-', '')
    when c ~ '^(\d|\d{3}|\d{5}|\d{7})$' then '0' || c
    else c
  end
$$;

begin;
set local session_replication_role = replica;

insert into public.sic_codes (code, description)
select distinct on (public.sic_pad(code)) public.sic_pad(code), description
  from public.sic_codes where public.sic_pad(code) <> code
 order by public.sic_pad(code), description nulls last
on conflict (code) do update set description = coalesce(public.sic_codes.description, excluded.description);

update public.leads set sic_code = public.sic_pad(sic_code) where sic_code is not null and public.sic_pad(sic_code) <> sic_code;
update public.companies set sic_code = public.sic_pad(sic_code) where sic_code is not null and public.sic_pad(sic_code) <> sic_code;

delete from public.sic_codes where public.sic_pad(code) <> code;
commit;

-- An import says how many of its names were on the other clients' projects it was checked against
-- (Oct 2026: an Agency Group's clients in a territory, chosen on the import).
alter table public.import_batches add column if not exists other_count int not null default 0;
