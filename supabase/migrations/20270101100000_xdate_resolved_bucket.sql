-- X-Dates by Month (Sean, Nov 2026): "Off the list" counts the appointments too, as the Pipeline by
-- Month does (the names resolved: appointments, invalid ones and the rest), so its names are those of
-- a new bucket, 'resolved': 'off' and 'appointment' together. The other buckets are as they were.
--
-- Safe to run more than once.

do $$
declare
  v_def text;
begin
  v_def := pg_get_functiondef('public.xdate_month_leads_filtered(integer,text,bigint[],bigint,text,bigint,bigint[],integer,integer)'::regprocedure);
  if position('''resolved''' in v_def) = 0 then
    if position('p_bucket is null or x.bucket = p_bucket)' in v_def) = 0 then
      raise exception 'xdate_month_leads_filtered is not as expected';
    end if;
    execute replace(v_def, 'p_bucket is null or x.bucket = p_bucket)',
                    'p_bucket is null or x.bucket = p_bucket or (p_bucket = ''resolved'' and x.bucket in (''off'', ''appointment'')))');
  end if;

  v_def := pg_get_functiondef('public.xdate_month_leads(integer,text,bigint,bigint,integer,integer)'::regprocedure);
  if position('''resolved''' in v_def) = 0 then
    if position('else ''off'' end) = p_bucket)' in v_def) = 0 then
      raise exception 'xdate_month_leads is not as expected';
    end if;
    execute replace(v_def, 'else ''off'' end) = p_bucket)',
                    'else ''off'' end) = any(case when p_bucket = ''resolved'' then array[''off'', ''appointment''] else array[p_bucket] end))');
  end if;
end $$;
