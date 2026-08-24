# Beacon CRM — Design Preview

A modern, interactive prototype of the rebuilt **Beacon** lead-management platform,
built with **Next.js (App Router)**. It reproduces the current app's core workflows —
dashboard, leads, appointments, clients, and reports — on a modern, responsive,
light/dark-aware interface.

This is a **design preview with sample data**. It is not connected to a live
database; it exists to show what the rebuild looks and feels like, and to serve as
the real starting codebase for the production build described in the Rebuild proposal.

## Run it

```bash
npm install      # already installed if this was scaffolded here
npm run dev      # http://localhost:3000
```

For a production build:

```bash
npm run build && npm start
```

### No-build preview
`public/preview.html` is a single self-contained file — open it directly in any
browser to see the same UI with zero setup (handy for a quick demo).

## How it's organized

```
app/
  layout.js              # app shell (sidebar + main)
  page.js                # Dashboard
  leads/page.js          # Leads (search + filter — interactive)
  appointments/page.js   # Appointments
  clients/page.js        # Clients
  reports/page.js        # Reports
  components/            # Sidebar, Topbar, StatusPill
lib/
  data.js                # sample data (leads, clients, appointments, reps)
  supabaseClient.js      # where Supabase plugs in for the real build
public/
  preview.html           # standalone no-build preview
```

## Turning this into the real app (Next.js + Supabase)

1. `npm install @supabase/supabase-js`
2. Add Supabase URL + anon key to `.env.local` (see `lib/supabaseClient.js`).
3. Replace the imports from `lib/data.js` in each page with Supabase queries, e.g.
   `const { data: leads } = await supabase.from('leads').select('*')`, with
   Row-Level Security controlling which client's data each user can see.
4. Add Supabase Auth for login, and Supabase Storage for documents.

The visual language, components, and page structure carry straight over — only the
data source changes.
