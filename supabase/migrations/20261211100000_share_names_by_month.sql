-- Share names evenly, month by month (Sean, Oct 2026): two reps on a
-- project held 631 names each, but one had 57 of its December renewals and
-- the other 1. Sharing out took the least-called names from whoever held
-- most, and the names being called now are the ones renewing soonest, so
-- each month's renewals stayed with whoever had been working them.
--
-- Now each renewal month (the name's renewal date: the Ultimate X-Date, else
-- its first line's; names with none as one more group) is shared out on its
-- own: everyone gets an even share of every month, and the totals still come
-- out even (a month's odd names go to whoever has fewest so far). Within a
-- month, whoever holds most keeps the larger share and gives up the names
-- they have called least, so the fewest names move.
--
-- Safe to run more than once. Nothing else changes; the next "Share names
-- evenly" (or a rep added or taken off) shares the names out this way.

CREATE OR REPLACE FUNCTION public.distribute_names(p_project_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_reps   bigint[];
  v_k      int;
  v_total  int;
  v_before jsonb;
  v_moved  int := 0;
  v_n      int;
  b        record;
  rep      record;
begin
  perform 1 from public.projects where id = p_project_id for update;
  if not found then
    raise exception 'That project no longer exists' using errcode = 'P0002';
  end if;

  select coalesce(array_agg(pa.ae_user_id order by pa.ae_user_id), '{}')
    into v_reps
    from public.project_assignments pa
    join public.users u on u.id = pa.ae_user_id and u.status = 'active'
   where pa.project_id = p_project_id;
  v_k := coalesce(array_length(v_reps, 1), 0);

  -- Names held by anyone no longer on the project go back in the pool.
  update public.leads l set assigned_user_id = null
    from public.call_results r
   where r.id = l.result_id and r.viable and r.callable
     and l.project_id = p_project_id and l.deleted_at is null
     and l.assigned_user_id is not null
     and not (l.assigned_user_id = any(v_reps));

  select coalesce(jsonb_object_agg(uid, n), '{}') into v_before
    from (select l.assigned_user_id as uid, count(*) as n
            from public.leads l join public.call_results r on r.id = l.result_id
           where l.project_id = p_project_id and l.deleted_at is null and r.viable and r.callable and l.assigned_user_id is not null
           group by 1) c;

  if v_k = 0 then
    return jsonb_build_object('project_id', p_project_id, 'reps', 0, 'moved', 0,
                              'message', 'Nobody is assigned to this project yet');
  end if;

  -- The names to share, each with its renewal month (0: none).
  drop table if exists pg_temp.share_names;
  create temp table share_names as
    select l.id, l.assigned_user_id as uid, l.call_weight, l.date_last_worked,
           coalesce(extract(month from coalesce(i.ultimate_xdate, least(i.pkg_xdate, i.wc_xdate, i.auto_xdate, i.health_xdate,
             i.dental_xdate, i.vision_xdate, i.prof_liab_xdate, i.do_xdate, i.eo_xdate)))::int, 0) as mon
      from public.leads l
      join public.call_results r on r.id = l.result_id
      -- One coverage row a name (its latest), so no name is counted twice.
      left join lateral (select * from public.insurance_details x where x.lead_id = l.id order by x.id desc limit 1) i on true
     where l.project_id = p_project_id and l.deleted_at is null and r.viable and r.callable;
  select count(*) into v_total from share_names;

  -- Each rep's share of each month, and of all the names so far.
  drop table if exists pg_temp.share_targets;
  create temp table share_targets (uid bigint, mon int, target int, primary key (uid, mon));
  drop table if exists pg_temp.share_running;
  create temp table share_running as select u.uid, 0 as total from unnest(v_reps) as u(uid);

  for b in select mon, count(*)::int as n from share_names group by mon order by mon loop
    -- An even share each; the month's odd names to whoever has fewest so far
    -- (then whoever holds most of this month already, so fewer move).
    insert into share_targets (uid, mon, target)
    select s.uid, b.mon, b.n / v_k + case when s.rank_no <= b.n % v_k then 1 else 0 end
      from (select sr.uid, row_number() over (order by sr.total, coalesce(h.n, 0) desc, sr.uid) as rank_no
              from share_running sr
              left join (select uid, count(*) as n from share_names where mon = b.mon group by uid) h on h.uid = sr.uid) s;
    update share_running sr set total = sr.total + t.target
      from share_targets t where t.uid = sr.uid and t.mon = b.mon;
  end loop;

  -- Over a month's share: the names called least go back in the pool.
  for rep in
    select t.uid, t.mon, t.target, count(s.id)::int as held
      from share_targets t join share_names s on s.uid = t.uid and s.mon = t.mon
     group by t.uid, t.mon, t.target
    having count(s.id) > t.target
  loop
    with gone as (
      select id from share_names
       where uid = rep.uid and mon = rep.mon
       order by call_weight, date_last_worked nulls first, id desc
       limit rep.held - rep.target)
    update share_names s set uid = null from gone where s.id = gone.id;
    get diagnostics v_n = row_count;
    v_moved := v_moved + v_n;
  end loop;

  -- Under a month's share: names from that month's pool.
  for rep in
    select t.uid, t.mon, t.target, (select count(*)::int from share_names s where s.uid = t.uid and s.mon = t.mon) as held
      from share_targets t
  loop
    if rep.held < rep.target then
      with given as (
        select id from share_names where uid is null and mon = rep.mon order by id limit rep.target - rep.held)
      update share_names s set uid = rep.uid from given where s.id = given.id;
    end if;
  end loop;

  update public.leads l set assigned_user_id = s.uid
    from share_names s
   where s.id = l.id and l.assigned_user_id is distinct from s.uid;

  drop table if exists pg_temp.share_names;
  drop table if exists pg_temp.share_targets;
  drop table if exists pg_temp.share_running;

  return jsonb_build_object(
    'project_id', p_project_id,
    'names', v_total,
    'reps', v_k,
    'moved', v_moved,
    'before', v_before,
    'after', (select coalesce(jsonb_object_agg(uid, n), '{}')
                from (select l.assigned_user_id as uid, count(*) as n
                        from public.leads l join public.call_results r on r.id = l.result_id
                       where l.project_id = p_project_id and l.deleted_at is null and r.viable and r.callable and l.assigned_user_id is not null
                       group by 1) c));
end $function$;
revoke execute on function public.distribute_names(bigint) from public, anon, authenticated;
