-- =============================================================================
-- Special Pay on appointment projects (Sean, Nov 2026: "add the same 'special pay' section that Lead
-- projects have to the Appt projects ... Goal for Appts per pay period with special pay that will apply")
--
-- As on a DB dev project, with appointments in place of leads: an appointment project's goal is so many
-- appointments one rep sets on it in a pay period, and its Special Pay so much more for each. Once the
-- goal is hit, each of those appointments earns it, and each one after it that pay period; the rep is
-- told when they hit it. An appointment found invalid (charged back) takes its Special Pay back with it.
--
--   set_project_special_pay()   a DB dev or an appointment project
--   award_special_pay()         leads on a DB dev project; appointments on an appointment project
--   pay()                       as before, Special Pay looked at after an appointment's pay too
--   charge_back()               a lead's chargeback takes back its lead Special Pay; an appointment's, its own
--
-- Safe to run more than once.
-- =============================================================================

comment on column public.projects.special_goal is 'Special Pay: leads (DB dev) or appointments (appointment project) one rep makes on this project in a pay period to earn it (null: none)';
comment on column public.projects.special_rate is 'Special Pay: USD more for each of those leads or appointments, once the goal is hit';

/** An administrator sets a DB dev or appointment project's Special Pay: the goal (leads or appointments a pay period) and the pay each; both null/0 for none. */
create or replace function public.set_project_special_pay(p_project_id bigint, p_goal int, p_rate numeric)
returns jsonb
language plpgsql security invoker set search_path = public as $$
declare
  v_type text;
  v_what text;
  v_row  public.projects;
begin
  if not public.is_admin() then
    raise exception 'Only an administrator can set pay rates' using errcode = '42501';
  end if;
  select t.code into v_type from public.projects p left join public.project_types t on t.id = p.project_type_id where p.id = p_project_id;
  if not found then
    raise exception 'That project no longer exists' using errcode = 'P0002';
  end if;
  v_what := case when v_type = 'APPT' then 'appointment' else 'lead' end;
  if p_goal is not null and (p_goal < 1 or p_goal > 1000) then
    raise exception 'Special Pay goal: a number of %s from 1 to 1,000', v_what || 's' using errcode = '22023';
  end if;
  if coalesce(p_rate, 0) < 0 or coalesce(p_rate, 0) > 1000 then
    raise exception 'Special Pay must be between $0.00 and $1,000.00 a %', v_what using errcode = '22023';
  end if;
  if (p_goal is null) <> (coalesce(p_rate, 0) = 0) then
    raise exception 'Special Pay needs both a goal and an amount a % (or neither)', v_what using errcode = '22023';
  end if;
  if p_goal is not null and v_type is distinct from 'DBDV' and v_type is distinct from 'APPT' then
    raise exception 'Special Pay is for DB dev and appointment projects' using errcode = '22023';
  end if;
  update public.projects set special_goal = p_goal, special_rate = round(coalesce(p_rate, 0), 2)
   where id = p_project_id
  returning * into v_row;
  return jsonb_build_object('id', v_row.id, 'special_goal', v_row.special_goal, 'special_rate', v_row.special_rate);
end $$;
revoke execute on function public.set_project_special_pay(bigint, int, numeric) from public, anon;
grant execute on function public.set_project_special_pay(bigint, int, numeric) to authenticated;

/**
 * Pays Special Pay once p_user hits p_project's goal this pay period: on a DB dev project, its leads; on an
 * appointment project, its appointments. Each one counted earns it once (an appointment's Special Pay kept
 * with the appointment). Tells the rep the first time in a pay period. Returns how many were paid now.
 */
create or replace function public.award_special_pay(p_user bigint, p_project bigint)
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_tz    text := public.business_tz();
  v_goal  int;
  v_rate  numeric(10,2);
  v_name  text;
  v_type  text;
  v_kind  text;
  v_what  text;
  v_from  date;
  v_to    date;
  v_had   int;
  v_count int;
  v_new   int;
  v_rule  bigint;
  v_on    boolean;
begin
  select p.special_goal, p.special_rate, p.name, t.code into v_goal, v_rate, v_name, v_type
    from public.projects p left join public.project_types t on t.id = p.project_type_id
   where p.id = p_project;
  if p_user is null or v_type not in ('DBDV', 'APPT') or coalesce(v_goal, 0) < 1 or coalesce(v_rate, 0) <= 0 then
    return 0;
  end if;
  v_kind := case v_type when 'APPT' then 'appointment' else 'lead' end;
  v_what := v_kind || 's';
  -- One rep and project at a time, so two saved together never pay one twice.
  perform pg_advisory_xact_lock(hashtextextended(format('special_pay:%s:%s', p_user, p_project), 0));
  select pp.starts_on, pp.ends_on into v_from, v_to from public.pay_period_of((now() at time zone v_tz)::date) pp;

  -- Their leads (or appointments) on it this period, any charged back left out.
  create temp table if not exists special_pay_earned (lead_id bigint, appointment_id bigint, ord bigint) on commit drop;
  truncate special_pay_earned;
  insert into special_pay_earned
  select pe.lead_id, case when v_kind = 'appointment' then pe.appointment_id end, pe.id
    from public.pay_events pe
   where pe.user_id = p_user and pe.project_id = p_project and pe.kind = v_kind and not pe.is_chargeback
     and not exists (select 1 from public.pay_events r where r.reverses_id = pe.id)
     and (v_kind = 'lead' or pe.appointment_id is not null)
     and pe.created_at >= (v_from::timestamp at time zone v_tz)
     and pe.created_at <  ((v_to + 1)::timestamp at time zone v_tz);
  select count(*) into v_count from special_pay_earned;
  if v_count < v_goal then
    return 0;
  end if;

  -- Already hit this period? (Then this is one more, and no second message.)
  select count(*) into v_had
    from public.pay_events b
   where b.user_id = p_user and b.project_id = p_project and b.kind = 'special' and not b.is_chargeback
     and not exists (select 1 from public.pay_events r where r.reverses_id = b.id)
     and b.created_at >= (v_from::timestamp at time zone v_tz)
     and b.created_at <  ((v_to + 1)::timestamp at time zone v_tz);

  insert into public.pay_events (user_id, project_id, lead_id, appointment_id, kind, amount, note, created_by)
  select p_user, p_project, e.lead_id, e.appointment_id, 'special', v_rate,
         format('Special Pay: %s %s on this project in the pay period %s – %s', v_goal, v_what, to_char(v_from, 'FMMM/FMDD'), to_char(v_to, 'FMMM/FMDD')),
         public.app_user_id()
    from special_pay_earned e
   where (v_kind = 'lead' and e.lead_id is not null
          and not exists (select 1 from public.pay_events b
                           where b.kind = 'special' and b.lead_id = e.lead_id and b.appointment_id is null and b.user_id = p_user and not b.is_chargeback
                             and not exists (select 1 from public.pay_events r where r.reverses_id = b.id)))
      or (v_kind = 'appointment'
          and not exists (select 1 from public.pay_events b
                           where b.kind = 'special' and b.appointment_id = e.appointment_id and b.user_id = p_user and not b.is_chargeback
                             and not exists (select 1 from public.pay_events r where r.reverses_id = b.id)))
   order by e.ord;
  get diagnostics v_new = row_count;

  if v_new > 0 and v_had = 0 then
    select r.id, r.enabled into v_rule, v_on from public.alert_rules r where r.trigger = 'special_pay' order by r.id limit 1;
    if v_rule is null or v_on then
      insert into public.notifications (user_id, kind, title, body, link)
      select u.id, 'lead',
             left(format('Special Pay: you hit %s %s on %s', v_goal, v_what, v_name), 160),
             left(format('That is %s more for each of your %s %s there this pay period (%s so far), and for each one after it until %s. It is on your pay summary as Special Pay.',
                         to_char(v_rate, 'FM$999,990.00'), v_count, v_what, to_char(v_rate * v_new, 'FM$999,990.00'), to_char(v_to, 'FMMM/FMDD')), 1000),
             '/reports/pay'
        from public.users u where u.id = p_user and u.status = 'active';
      if found and v_rule is not null then
        insert into public.alert_log (rule_id, subject, detail, status)
        values (v_rule, left(format('Special Pay: %s %s on %s', v_goal, v_what, v_name), 200), 'In-app to 1 person', 'sent');
      end if;
    end if;
  end if;
  return v_new;
end $$;
revoke execute on function public.award_special_pay(bigint, bigint) from public, anon, authenticated;

-- pay(): as before (20270130), Special Pay looked at after an appointment's pay as well as a lead's.
create or replace function public.pay(p_user bigint, p_project bigint, p_kind text, p_lead bigint,
                                      p_appointment bigint, p_call bigint, p_note text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_amount numeric(10,2);
  v_id bigint;
begin
  -- A lead is developed once: no second payment for it unless the first was
  -- charged back (a lead moved back to its DBDev project and promoted again).
  if p_kind = 'lead' and exists (
       select 1 from public.pay_events pe
        where pe.lead_id = p_lead and pe.kind = 'lead' and not pe.is_chargeback
          and not exists (select 1 from public.pay_events r where r.reverses_id = pe.id)) then
    return '[]'::jsonb;
  end if;
  -- A manager's own appointment and confirmation rates, when they have them, in place of the project's.
  select case p_kind when 'lead' then pr.lead_rate
                     when 'appointment' then coalesce(pp.appointment_rate, pr.appointment_rate)
                     else coalesce(pp.confirmation_rate, pr.confirmation_rate) end
    into v_amount
    from public.projects pr left join public.pay_profiles pp on pp.user_id = p_user
   where pr.id = p_project;
  insert into public.pay_events (user_id, project_id, lead_id, appointment_id, call_record_id, kind, amount, note, created_by)
  values (p_user, p_project, p_lead, p_appointment, p_call, p_kind, coalesce(v_amount, 0), p_note, public.app_user_id())
  returning id into v_id;
  if p_kind in ('lead', 'appointment') then
    perform public.award_special_pay(p_user, p_project);
  end if;
  return jsonb_build_object('id', v_id, 'user_id', p_user, 'kind', p_kind, 'amount', coalesce(v_amount, 0));
end $$;
revoke execute on function public.pay(bigint, bigint, text, bigint, bigint, bigint, text) from public, anon, authenticated;

-- charge_back(): as before; a lead's chargeback takes back its lead's Special Pay, an appointment's its own.
create or replace function public.charge_back(p_lead bigint, p_appointment bigint, p_kinds text[], p_call bigint, p_note text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  e record;
  v_out jsonb := '[]'::jsonb;
  v_id bigint;
  v_lead boolean := 'lead' = any(p_kinds);
  v_appt boolean := 'appointment' = any(p_kinds);
  v_kinds text[] := case when 'lead' = any(p_kinds) or 'appointment' = any(p_kinds) then p_kinds || array['special'] else p_kinds end;
begin
  for e in
    select pe.* from public.pay_events pe
     where pe.kind = any(v_kinds)
       and pe.reverses_id is null
       and (p_lead is null or pe.lead_id = p_lead)
       and (p_appointment is null or pe.appointment_id = p_appointment)
       -- Special Pay goes with what earned it: a lead's (no appointment), or an appointment's.
       and (pe.kind <> 'special' or 'special' = any(p_kinds)
            or (v_lead and pe.appointment_id is null)
            or (v_appt and pe.appointment_id is not null))
       and not exists (select 1 from public.pay_events x where x.reverses_id = pe.id)
     order by pe.id
     for update
  loop
    insert into public.pay_events (user_id, project_id, lead_id, appointment_id, call_record_id, kind, amount, reverses_id, note, created_by)
    values (e.user_id, e.project_id, e.lead_id, e.appointment_id, p_call, e.kind, -e.amount, e.id, p_note, public.app_user_id())
    returning id into v_id;
    v_out := v_out || jsonb_build_object('id', v_id, 'user_id', e.user_id, 'kind', e.kind, 'amount', -e.amount, 'reverses', e.id);
  end loop;
  return v_out;
end $$;
revoke execute on function public.charge_back(bigint, bigint, text[], bigint, text) from public, anon, authenticated;
