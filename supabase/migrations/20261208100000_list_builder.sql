-- =============================================================================
-- List Builder (Sean, Oct 2026): the businesses a client (or a prospect) wants
-- to target, picked as our list vendor's software has them: industries from
-- the SIC tree (a sector such as 15-17 Construction, its 2-digit groups, each
-- group's 4-digit codes, and 6-digit codes under those when loaded), the
-- employee size for each 2-digit group (from and to), and the territory
-- (states, counties, cities, ZIP codes, a radius around a ZIP), each with
-- what to leave out. A request is kept with its client (or, from a prospect,
-- with who they are), so what a client has targeted before shows next time;
-- it exports with the codes one to a line, to paste into the vendor's site.
--
-- A prospect fills one in from a link we send (no sign-in): the link carries
-- the Sales Rep it came from. A request in tells the client's (or the link's)
-- Sales Rep and the administrators.
--
--   list_sic             the tree: sectors, groups, codes (from sic_codes; an administrator can load a sheet)
--   list_requests        each request: who for, its criteria, notes, where it stands
--   list_request_links   links for prospects, each with its Sales Rep; can be turned off
--   submit_list_request  a prospect's request, through a link
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. The SIC tree
-- ---------------------------------------------------------------------------

create table if not exists public.list_sic (
  code    text primary key,                     -- "15-17", "15", "1521", "152101"
  name    text not null,
  kind    text not null check (kind in ('sector', 'group', 'industry', 'detail')),
  parent  text references public.list_sic(code) on delete cascade,
  sort    int not null default 0
);
create index if not exists list_sic_parent on public.list_sic (parent, sort);
alter table public.list_sic enable row level security;
drop policy if exists list_sic_read on public.list_sic;
create policy list_sic_read on public.list_sic for select using (true);
drop policy if exists list_sic_write on public.list_sic;
create policy list_sic_write on public.list_sic for all to authenticated using (public.is_admin()) with check (public.is_admin());
-- The prospect's page reads the tree before anyone signs in: it is the public SIC list.
grant select on public.list_sic to anon, authenticated;
grant insert, update, delete on public.list_sic to authenticated;

-- The sectors, as the list vendor's software groups them.
insert into public.list_sic (code, name, kind, parent, sort) values
  ('01-09', 'Agriculture, Forestry & Fishing', 'sector', null, 1),
  ('10-14', 'Mining', 'sector', null, 10),
  ('15-17', 'Construction', 'sector', null, 15),
  ('20-39', 'Manufacturing', 'sector', null, 20),
  ('40-49', 'Transportation, Communications & Utilities', 'sector', null, 40),
  ('50-51', 'Wholesale / Distributors', 'sector', null, 50),
  ('52-59', 'Retail Trade', 'sector', null, 52),
  ('60-67', 'Finance, Insurance & Real Estate', 'sector', null, 60),
  ('70-89', 'Services', 'sector', null, 70),
  ('91-98', 'Public Administration', 'sector', null, 91),
  ('99', 'Nonclassifiable Establishments', 'sector', null, 99)
on conflict (code) do nothing;

-- The 2-digit groups, each under its sector.
insert into public.list_sic (code, name, kind, parent, sort)
select g.code, g.name, 'group',
       (select s.code from public.list_sic s where s.kind = 'sector'
         and g.code::int between split_part(s.code, '-', 1)::int and coalesce(nullif(split_part(s.code, '-', 2), ''), s.code)::int),
       g.code::int
  from (values
    ('01', 'Agricultural Production - Crops'), ('02', 'Agricultural Production - Livestock & Animal Specialties'),
    ('07', 'Agricultural Services'), ('08', 'Forestry'), ('09', 'Fishing, Hunting & Trapping'),
    ('10', 'Metal Mining'), ('12', 'Coal Mining'), ('13', 'Oil & Gas Extraction'),
    ('14', 'Mining & Quarrying of Nonmetallic Minerals, Except Fuels'),
    ('15', 'Building Construction - General Contractors & Operative Builders'),
    ('16', 'Heavy Construction Other Than Building - Contractors'), ('17', 'Construction - Special Trade Contractors'),
    ('20', 'Food & Kindred Products'), ('21', 'Tobacco Products'), ('22', 'Textile Mill Products'),
    ('23', 'Apparel & Other Finished Fabric Products'), ('24', 'Lumber & Wood Products, Except Furniture'),
    ('25', 'Furniture & Fixtures'), ('26', 'Paper & Allied Products'), ('27', 'Printing, Publishing & Allied Industries'),
    ('28', 'Chemicals & Allied Products'), ('29', 'Petroleum Refining & Related Industries'),
    ('30', 'Rubber & Miscellaneous Plastics Products'), ('31', 'Leather & Leather Products'),
    ('32', 'Stone, Clay, Glass & Concrete Products'), ('33', 'Primary Metal Industries'),
    ('34', 'Fabricated Metal Products'), ('35', 'Industrial & Commercial Machinery & Computer Equipment'),
    ('36', 'Electronic & Other Electrical Equipment'), ('37', 'Transportation Equipment'),
    ('38', 'Measuring, Analyzing & Controlling Instruments'), ('39', 'Miscellaneous Manufacturing Industries'),
    ('40', 'Railroad Transportation'), ('41', 'Local & Suburban Transit & Highway Passenger Transportation'),
    ('42', 'Motor Freight Transportation & Warehousing'), ('43', 'United States Postal Service'),
    ('44', 'Water Transportation'), ('45', 'Transportation by Air'), ('46', 'Pipelines, Except Natural Gas'),
    ('47', 'Transportation Services'), ('48', 'Communications'), ('49', 'Electric, Gas & Sanitary Services'),
    ('50', 'Wholesale Trade - Durable Goods'), ('51', 'Wholesale Trade - Nondurable Goods'),
    ('52', 'Building Materials, Hardware, Garden Supply & Mobile Home Dealers'), ('53', 'General Merchandise Stores'),
    ('54', 'Food Stores'), ('55', 'Automotive Dealers & Gasoline Service Stations'), ('56', 'Apparel & Accessory Stores'),
    ('57', 'Home Furniture, Furnishings & Equipment Stores'), ('58', 'Eating & Drinking Places'), ('59', 'Miscellaneous Retail'),
    ('60', 'Depository Institutions'), ('61', 'Nondepository Credit Institutions'),
    ('62', 'Security & Commodity Brokers, Dealers, Exchanges & Services'), ('63', 'Insurance Carriers'),
    ('64', 'Insurance Agents, Brokers & Service'), ('65', 'Real Estate'), ('67', 'Holding & Other Investment Offices'),
    ('70', 'Hotels, Rooming Houses, Camps & Other Lodging Places'), ('72', 'Personal Services'), ('73', 'Business Services'),
    ('75', 'Automotive Repair, Services & Parking'), ('76', 'Miscellaneous Repair Services'), ('78', 'Motion Pictures'),
    ('79', 'Amusement & Recreation Services'), ('80', 'Health Services'), ('81', 'Legal Services'), ('82', 'Educational Services'),
    ('83', 'Social Services'), ('84', 'Museums, Art Galleries & Botanical & Zoological Gardens'), ('86', 'Membership Organizations'),
    ('87', 'Engineering, Accounting, Research, Management & Related Services'), ('88', 'Private Households'),
    ('89', 'Services, Not Elsewhere Classified'),
    ('91', 'Executive, Legislative & General Government, Except Finance'), ('92', 'Justice, Public Order & Safety'),
    ('93', 'Public Finance, Taxation & Monetary Policy'), ('94', 'Administration of Human Resource Programs'),
    ('95', 'Administration of Environmental Quality & Housing Programs'), ('96', 'Administration of Economic Programs'),
    ('97', 'National Security & International Affairs')
  ) as g(code, name)
on conflict (code) do nothing;

-- Every 4-digit code we hold (the standard list, sic_codes), under its group; a 6-digit one under its 4.
insert into public.list_sic (code, name, kind, parent, sort)
select s.code, coalesce(nullif(btrim(s.description), ''), s.code), 'industry', left(s.code, 2), s.code::int
  from public.sic_codes s
 where s.code ~ '^\d{4}$' and exists (select 1 from public.list_sic g where g.code = left(s.code, 2) and g.kind = 'group')
on conflict (code) do nothing;
insert into public.list_sic (code, name, kind, parent, sort)
select s.code, coalesce(nullif(btrim(s.description), ''), s.code), 'detail', left(s.code, 4), s.code::int
  from public.sic_codes s
 where s.code ~ '^\d{6}$' and exists (select 1 from public.list_sic i where i.code = left(s.code, 4))
on conflict (code) do nothing;
-- 99 is a sector with no groups of its own: 9999 sits right under it.
insert into public.list_sic (code, name, kind, parent, sort)
values ('9999', 'Nonclassifiable Establishments', 'industry', '99', 9999)
on conflict (code) do update set parent = '99';

-- ---------------------------------------------------------------------------
-- 2. Requests and the links prospects use
-- ---------------------------------------------------------------------------

create table if not exists public.list_request_links (
  id           bigint generated always as identity primary key,
  token        text not null unique default encode(extensions.gen_random_bytes(18), 'hex'),
  label        text check (label is null or length(label) <= 120),
  sales_rep_id bigint references public.users(id) on delete set null,
  company_id   bigint references public.companies(id) on delete set null,
  active       boolean not null default true,
  expires_at   timestamptz,
  created_by   bigint references public.users(id) on delete set null,
  created_at   timestamptz not null default now()
);
alter table public.list_request_links enable row level security;
drop policy if exists list_request_links_staff on public.list_request_links;
create policy list_request_links_staff on public.list_request_links for all to authenticated
  using (public.is_admin() or public.is_manager()) with check (public.is_admin() or public.is_manager());
grant select, insert, update, delete on public.list_request_links to authenticated;

create table if not exists public.list_requests (
  id           bigint generated always as identity primary key,
  company_id   bigint references public.companies(id) on delete set null,
  sales_rep_id bigint references public.users(id) on delete set null,
  link_id      bigint references public.list_request_links(id) on delete set null,
  source       text not null default 'staff' check (source in ('staff', 'client', 'prospect')),
  title        text check (title is null or length(title) <= 160),
  -- From a prospect: who they are ({ name, company, email, phone }).
  prospect     jsonb,
  -- { sic: [codes], employees: { "15": { min, max } }, include: { states, counties, cities, zips, radius: { zip, miles } },
  --   exclude: { states, counties, cities, zips }, zips: [the ZIPs the radius and lists came to, less those left out] }
  criteria     jsonb not null default '{}'::jsonb,
  notes        text check (notes is null or length(notes) <= 4000),
  status       text not null default 'new' check (status in ('new', 'in_progress', 'pulled', 'closed')),
  created_by   bigint references public.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists list_requests_company on public.list_requests (company_id, created_at desc);
create index if not exists list_requests_rep on public.list_requests (sales_rep_id, created_at desc);
alter table public.list_requests enable row level security;

-- Staff read and work every request; a client reads and makes its own.
drop policy if exists list_requests_read on public.list_requests;
create policy list_requests_read on public.list_requests for select to authenticated
  using (public.is_staff() or (company_id is not null and company_id = public.app_company_id()));
drop policy if exists list_requests_insert on public.list_requests;
create policy list_requests_insert on public.list_requests for insert to authenticated
  with check (public.is_staff() or (source = 'client' and company_id = public.app_company_id()));
drop policy if exists list_requests_update on public.list_requests;
create policy list_requests_update on public.list_requests for update to authenticated
  using (public.is_staff() or (company_id = public.app_company_id() and status = 'new'))
  with check (public.is_staff() or (company_id = public.app_company_id() and status = 'new'));
drop policy if exists list_requests_delete on public.list_requests;
create policy list_requests_delete on public.list_requests for delete to authenticated using (public.is_admin());
grant select, insert, update, delete on public.list_requests to authenticated;

-- Its Sales Rep: the client's when not given; who made it; when it changed. A client never sets
-- where it stands, and a prospect's comes only through a link.
create or replace function public.tg_list_requests_fill()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce(new.created_by, public.app_user_id());
    if new.sales_rep_id is null and new.company_id is not null then
      new.sales_rep_id := (select c.sales_rep_id from public.companies c where c.id = new.company_id);
    end if;
    if current_user = 'authenticated' and not public.is_staff() then
      new.status := 'new';
      new.source := 'client';
    end if;
  else
    new.updated_at := now();
    if current_user = 'authenticated' and not public.is_staff() then
      new.status := old.status;
      new.sales_rep_id := old.sales_rep_id;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists list_requests_fill on public.list_requests;
create trigger list_requests_fill before insert or update on public.list_requests
  for each row execute function public.tg_list_requests_fill();

-- A request in: its Sales Rep and the administrators are told (not whoever made it).
insert into public.alert_rules (name, trigger, channel, recipients, enabled)
select 'List request in', 'list_request', 'inapp', null, true
 where not exists (select 1 from public.alert_rules r where r.trigger = 'list_request');

create or replace function public.tg_list_requests_notify()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_who text := coalesce(
    (select c.name from public.companies c where c.id = new.company_id),
    nullif(btrim(concat_ws(' · ', new.prospect->>'company', new.prospect->>'name')), ''),
    'A prospect');
  v_to bigint[] := array(select u.id from public.users u where u.role = 'admin' and u.status = 'active' and u.deleted_at is null)
                   || case when new.sales_rep_id is null then array[]::bigint[] else array[new.sales_rep_id] end;
begin
  perform public.notify_users(
    (select array_agg(distinct x) from unnest(v_to) x),
    'system',
    left(format('List request: %s', v_who), 160),
    concat_ws(' · ', coalesce(new.title, 'Industries and territory to target'),
      case new.source when 'prospect' then 'from a prospect''s link' when 'client' then 'from the client' else null end),
    '/list-builder/' || new.id,
    'list_request');
  return new;
end $$;
drop trigger if exists list_requests_notify on public.list_requests;
create trigger list_requests_notify after insert on public.list_requests
  for each row execute function public.tg_list_requests_notify();

-- ---------------------------------------------------------------------------
-- 3. A prospect's request, through a link (no sign-in)
-- ---------------------------------------------------------------------------

/** What a link's page shows before the prospect fills it in: whether it is good, and from whom. */
create or replace function public.list_request_link(p_token text)
returns table (ok boolean, label text, rep text, company text)
language sql stable security definer set search_path = public as $$
  select (l.active and (l.expires_at is null or l.expires_at > now())), l.label,
         nullif(btrim(concat_ws(' ', u.first_name, u.last_name)), ''), c.name
    from public.list_request_links l
    left join public.users u on u.id = l.sales_rep_id
    left join public.companies c on c.id = l.company_id
   where l.token = p_token;
$$;
revoke execute on function public.list_request_link(text) from public;
grant execute on function public.list_request_link(text) to anon, authenticated;

/** A prospect sends their criteria through a good link; returns the request's id. */
create or replace function public.submit_list_request(p_token text, p_prospect jsonb, p_criteria jsonb, p_notes text default null)
returns bigint
language plpgsql security definer set search_path = public as $$
declare
  l public.list_request_links;
  v_id bigint;
begin
  select * into l from public.list_request_links where token = p_token;
  if not found or not l.active or (l.expires_at is not null and l.expires_at <= now()) then
    raise exception 'This link is no longer open. Ask us for a new one.' using errcode = '42501';
  end if;
  if coalesce(btrim(p_prospect->>'name'), '') = '' or coalesce(btrim(p_prospect->>'email'), '') = '' then
    raise exception 'Give your name and email, so we can reach you' using errcode = '22023';
  end if;
  if jsonb_typeof(p_criteria) is distinct from 'object' or length(p_criteria::text) > 200000 then
    raise exception 'Those criteria could not be read' using errcode = '22023';
  end if;
  insert into public.list_requests (company_id, sales_rep_id, link_id, source, title, prospect, criteria, notes)
  values (l.company_id, l.sales_rep_id, l.id, 'prospect',
          left(nullif(btrim(coalesce(p_prospect->>'company', '')), ''), 160),
          jsonb_build_object('name', left(btrim(p_prospect->>'name'), 120), 'company', left(btrim(coalesce(p_prospect->>'company', '')), 160),
                             'email', left(btrim(p_prospect->>'email'), 254), 'phone', left(btrim(coalesce(p_prospect->>'phone', '')), 40)),
          p_criteria, left(nullif(btrim(coalesce(p_notes, '')), ''), 4000))
  returning id into v_id;
  return v_id;
end $$;
revoke execute on function public.submit_list_request(text, jsonb, jsonb, text) from public;
grant execute on function public.submit_list_request(text, jsonb, jsonb, text) to anon, authenticated;
