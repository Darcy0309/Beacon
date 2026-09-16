# Beacon CRM

Lead-generation and appointment-setting CRM for Signature Marketing — a working
rebuild of the legacy DCMPower / BeaconApp (VB.NET + ASP.NET Web Forms + SQL
Server) on Next.js and Supabase.

This is a real application: PostgreSQL schema, Supabase Auth, Row Level
Security, and full create/read/update/delete on every module. Nothing is mocked.

## Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack, Server Components + Server Actions) |
| UI | Tailwind CSS v4, shadcn/ui, lucide-react |
| Database | PostgreSQL 17 (Supabase) |
| Auth | Supabase Auth (email + password) |
| Security | PostgreSQL Row Level Security |

## Getting started

Requires Node 20+, Docker, and the [Supabase CLI](https://supabase.com/docs/guides/cli).

```bash
npm install
npm run db:start     # starts Postgres + Auth + Studio in Docker, applies
                     # migrations and seeds data (first run pulls ~9GB of images)
npm run dev          # http://localhost:3000
```

`npm run db:start` prints the local API URL and keys. They are already written to
`.env.local`; if the values differ, update:

```
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<publishable key>
```

### Demo accounts

All use the password `Beacon!2026`:

| Email | Role | Sees |
|---|---|---|
| `admin@beacon.test` | Administrator | Everything, including users and IP lockdown |
| `sean@beacon.test` | Account Manager | All accounts, leads and appointments |
| `agent@beacon.test` | Agent | Leads, appointments, QA, bulletin |
| `client@beacon.test` | Client | Only their own company's projects and leads |

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run db:start` / `db:stop` | Start / stop the local Supabase stack |
| `npm run db:reset` | Drop, re-run migrations, re-seed |
| `npm run smoke` | Sign in as each role and assert RLS exposes the right rows |
| `npm run db:studio` | Print the Supabase Studio URL (http://127.0.0.1:54323) |

## Project layout

```
app/                 route per module (leads, appointments, clients, …)
components/          UI and record forms
  ui/                shadcn primitives
lib/
  queries.js         server-side reads   (all data fetching)
  actions.js         server actions      (all writes)
  supabase/          browser + server clients
  display.js         formatting helpers
  constants.js       status → colour maps
proxy.js             session refresh + route protection (Next 16 renamed
                     middleware.js → proxy.js)
supabase/
  migrations/        schema + RLS policies
  seed.sql           lookups, demo accounts, sample records
scripts/smoke-test.mjs
```

## Data model

Ported from the legacy SQL Server schema in `../sql/DocumentsCDMPOWER.sql`
(structure only — those dumps carry no rows, so the seed supplies data).

| Legacy table | Here |
|---|---|
| `UserMaster`, `UserType` | `users`, `user_types` |
| `CompanyMaster` | `companies` (the "Clients" screen) |
| `ProjectMaster`, `ClientAssignProject` | `projects`, `project_assignments` |
| `LEADMASTER`, `LEADSTATUS`, `LeadCompany` | `leads`, `lead_statuses` |
| `InsuranceDetails` | `insurance_details` (policy X-dates) |
| `AppointmentMaster`, `AppointmentStatus` | `appointments`, `appointment_statuses` |
| `AgencyMaster` | `agencies` (the "Insurance Companies" screen) |
| `tblCallRecord` | `call_records` (+ QA scoring) |
| `FeedbackMaster`, `FBStatusMaster` | `feedback`, `fb_statuses` |
| `BulletinBoard` | `bulletin_board` |
| `AEIDoc` | `documents` |
| `tbl_FileImport` | `import_batches` |
| `tblIPAddress` | `ip_whitelist` |
| `MailAlert` (VB module) | `alert_rules`, `alert_log` |

## Security model

Four roles, enforced in the database rather than the UI:

- **admin** — full access, including user administration and IP lockdown
- **manager** — all accounts, leads, appointments, projects and imports
- **agent** — leads, appointments, QA and the bulletin board
- **client** — read-only, and only rows belonging to their own company

Every table has RLS enabled. The navigation hides what a role cannot use, but
the policies are what actually deny access — `npm run smoke` proves it.

## Deploying

The app runs against any Supabase project, not just the local stack:

1. Create a project at [supabase.com](https://supabase.com).
2. `supabase link --project-ref <ref>` then `supabase db push` to apply the migrations.
3. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in your host
   (e.g. Vercel) and deploy.

Create real users through Supabase Auth, then add a matching row in `users` with
the correct `role` and `auth_id`.
