-- The Insurance Companies list (Sean, Nov 2026): for each carrier, the states
-- its leads are in, how many leads (X-dates) it has there, and how many
-- clients those leads belong to, from the carrier fields on our leads; for
-- every state, or the states picked.
--
--   A lead's carriers are those its policy lines name (the carrier fields and
--   the dental and vision providers, as a call list's carrier filter reads
--   them; not its agency), matched to the list by carrier_key(), and the
--   carrier its agency_id names.
--
--   carrier_footprint(states)   a row a carrier with leads: its states, its
--                     leads (a lead once, whichever of its policy lines name
--                     the carrier, or the lead's own agency_id), its clients
--
-- Administrators only. Safe to run more than once.

create or replace function public.carrier_footprint(p_states text[] default null)
returns table (agency_id bigint, states text[], leads bigint, clients bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'The carriers'' figures are for administrators' using errcode = '42501';
  end if;
  return query
  with names as (
    select a.id, public.carrier_key(a.name) as k from public.agencies a
     where a.deleted_at is null and public.carrier_key(a.name) is not null
  ), keyed as (
    -- Each name written on the leads, matched to its carrier once (a few hundred names, not a key a lead).
    select w.name, n.id
      from (select distinct v.name
              from public.insurance_details d
             cross join lateral (values (d.pkg_carrier), (d.wc_carrier), (d.auto_carrier), (d.health_carrier), (d.dental_provider), (d.vision_provider),
                                        (d.prof_liab_carrier), (d.do_carrier), (d.eo_carrier), (d.homeowner_carrier), (d.personal_auto_carrier),
                                        (d.personal_lines_carrier)) v(name)
             where v.name is not null) w
      join names n on n.k = public.carrier_key(w.name)
  ), lead_carriers as (
    select d.lead_id, k.id as agency_id
      from public.insurance_details d
     cross join lateral (values (d.pkg_carrier), (d.wc_carrier), (d.auto_carrier), (d.health_carrier), (d.dental_provider), (d.vision_provider),
                                (d.prof_liab_carrier), (d.do_carrier), (d.eo_carrier), (d.homeowner_carrier), (d.personal_auto_carrier),
                                (d.personal_lines_carrier)) v(name)
      join keyed k on k.name = v.name
    union
    select l.id, l.agency_id from public.leads l where l.agency_id is not null and l.deleted_at is null
  )
  select lc.agency_id,
         coalesce(array_agg(distinct upper(btrim(l.state))) filter (where nullif(btrim(l.state), '') is not null), '{}'),
         count(distinct l.id),
         count(distinct p.company_id)
    from lead_carriers lc
    join public.leads l on l.id = lc.lead_id and l.deleted_at is null
    left join public.projects p on p.id = l.project_id
   where p_states is null or cardinality(p_states) = 0 or upper(btrim(l.state)) = any(p_states)
   group by lc.agency_id;
end $$;
revoke execute on function public.carrier_footprint(text[]) from public, anon;
grant execute on function public.carrier_footprint(text[]) to authenticated;
