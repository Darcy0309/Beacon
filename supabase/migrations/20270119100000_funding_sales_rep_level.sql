-- Program Funding seen at the Sales Rep's level (client, Nov 2026: "Mike & I are admins, but will
-- also be sales reps for our own clients. As Admins, we'd want to have access to all client info
-- within the system, but ... only show the project funding info for us at the sales rep level").
--
-- Who sees a project's funding (its plan and payments, Payments Due, marking paid, removing,
-- stopping, reminders, setting the plan):
--   its client's Sales Rep, whatever their role;
--   an administrator who is nobody's Sales Rep (the office): every client's;
--   an administrator who is a Sales Rep: their own clients', and those with no Sales Rep yet
--     (so no client's funding is out of everyone's sight).
-- Everything else stays as it was: administrators see all of every client otherwise.
--
-- Safe to run again.

-- Someone who is a Sales Rep for at least one client (not deleted).
create or replace function public.is_sales_rep(p_user bigint)
returns boolean
language sql stable security definer set search_path = public as $$
  select p_user is not null and exists (select 1 from public.companies c where c.sales_rep_id = p_user and c.deleted_at is null);
$$;
revoke execute on function public.is_sales_rep(bigint) from public, anon;
grant execute on function public.is_sales_rep(bigint) to authenticated;

create or replace function public.sees_project_funding(p_project bigint)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.projects p join public.companies c on c.id = p.company_id
     where p.id = p_project
       and ((c.sales_rep_id is not null and c.sales_rep_id = public.app_user_id())
            or (public.is_admin() and (c.sales_rep_id is null or not public.is_sales_rep(public.app_user_id())))));
$$;
revoke execute on function public.sees_project_funding(bigint) from public, anon;
grant execute on function public.sees_project_funding(bigint) to authenticated;

-- Setting a plan: an administrator, for a program whose funding they see.
create or replace function public.save_project_funding(p_project bigint, p_funding jsonb, p_payments jsonb)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_me bigint := public.app_user_id();
  v_count integer := 0;
  r jsonb;
begin
  if not public.is_admin() then
    raise exception 'Only an administrator sets a program''s funding' using errcode = '42501';
  end if;
  -- An administrator who is a Sales Rep: their own clients' programs (and those with no Sales Rep).
  if not public.sees_project_funding(p_project) then
    raise exception 'Only that client''s Sales Rep sets its program''s funding' using errcode = '42501';
  end if;
  if not exists (select 1 from public.projects where id = p_project) then
    raise exception 'That project no longer exists' using errcode = 'P0002';
  end if;

  insert into public.project_funding as f (project_id, plan, leads, appts, appts_included, setup_fee, list_fee, payments, first_leads, first_due, due_day, billing, updated_at, updated_by)
  values (p_project, coalesce(p_funding->>'plan', 'monthly'), coalesce((p_funding->>'leads')::int, 0), coalesce((p_funding->>'appts')::int, 0),
          coalesce((p_funding->>'appts_included')::boolean, false), coalesce((p_funding->>'setup_fee')::numeric, 0), coalesce((p_funding->>'list_fee')::numeric, 0),
          coalesce((p_funding->>'payments')::int, 1), (p_funding->>'first_leads')::int, (p_funding->>'first_due')::date, (p_funding->>'due_day')::int,
          case when p_funding->>'billing' = 'semimonthly' then 'semimonthly' else 'monthly' end, now(), v_me)
  on conflict (project_id) do update set
    plan = excluded.plan, leads = excluded.leads, appts = excluded.appts, appts_included = excluded.appts_included,
    setup_fee = excluded.setup_fee, list_fee = excluded.list_fee, payments = excluded.payments, first_leads = excluded.first_leads,
    first_due = excluded.first_due, due_day = excluded.due_day, billing = excluded.billing, updated_at = now(), updated_by = v_me;

  for r in select * from jsonb_array_elements(coalesce(p_payments, '[]'::jsonb)) loop
    insert into public.project_payments as p (project_id, kind, seq, label, due_date, amount, leads, appts, fees)
    values (p_project, 'installment', (r->>'seq')::int, left(coalesce(r->>'label', 'Payment'), 80), (r->>'due')::date,
            (r->>'amount')::numeric, coalesce((r->>'leads')::int, 0), coalesce((r->>'appts')::int, 0), coalesce((r->>'fees')::numeric, 0))
    on conflict (project_id, seq) where kind = 'installment' do update set
      label = excluded.label, due_date = excluded.due_date, amount = excluded.amount, leads = excluded.leads,
      appts = excluded.appts, fees = excluded.fees,
      rep_reminded_at = case when p.due_date is not distinct from excluded.due_date and p.amount = excluded.amount then p.rep_reminded_at end,
      client_reminded_at = case when p.due_date is not distinct from excluded.due_date and p.amount = excluded.amount then p.client_reminded_at end
    where p.paid_at is null and p.removed_at is null;
    v_count := v_count + 1;
  end loop;
  delete from public.project_payments
   where project_id = p_project and kind = 'installment' and paid_at is null and removed_at is null
     and seq not in (select (x->>'seq')::int from jsonb_array_elements(coalesce(p_payments, '[]'::jsonb)) x);
  return v_count;
end $$;
revoke execute on function public.save_project_funding(bigint, jsonb, jsonb) from public, anon;
grant execute on function public.save_project_funding(bigint, jsonb, jsonb) to authenticated;
