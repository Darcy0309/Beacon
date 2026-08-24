// Sample data for the Beacon CRM design preview.
// In the production rebuild this is replaced by queries to Supabase (see lib/supabaseClient.js).

export const STATUS = {
  appt:    { cls: 'p-appt',    label: 'Phone appointment' },
  survey:  { cls: 'p-survey',  label: 'Survey appointment' },
  hot:     { cls: 'p-hot',     label: 'X-date hot lead' },
  xdate:   { cls: 'p-xdate',   label: 'X-date lead' },
  profile: { cls: 'p-profile', label: 'X-date profile' },
  new:     { cls: 'p-new',     label: 'New' },
};

export const leads = [
  { id: 1,  co: 'Garry Insurance',    city: 'Phoenix, AZ',        initials: 'GI', color: '#2b6cb0', contact: 'Jeff Garry',      phone: '(602) 555-0148', status: 'appt',    xdate: 'Oct 14', rep: 'Sean F.' },
  { id: 2,  co: 'Rural Insurance',    city: 'Cedar Rapids, IA',   initials: 'RI', color: '#2c9d78', contact: 'Laura Meyer',     phone: '(319) 555-0173', status: 'survey',  xdate: 'Nov 02', rep: 'Mike P.' },
  { id: 3,  co: 'Insurance Pro AZ',   city: 'Tucson, AZ',         initials: 'IP', color: '#b7791f', contact: 'Jeff Matthews',   phone: '(520) 555-0119', status: 'hot',     xdate: 'Sep 29', rep: 'R. Colestock' },
  { id: 4,  co: 'Summit Benefits',    city: 'Denver, CO',         initials: 'SB', color: '#6d47c9', contact: 'Brian Vicini',    phone: '(303) 555-0192', status: 'xdate',   xdate: 'Dec 11', rep: 'Sean F.' },
  { id: 5,  co: 'Heartland Wealth',   city: 'Omaha, NE',          initials: 'HW', color: '#c1362c', contact: 'Dana Zinda',      phone: '(402) 555-0165', status: 'profile', xdate: 'Oct 30', rep: 'Mike P.' },
  { id: 6,  co: 'Collier & Co.',      city: 'Boise, ID',          initials: 'CC', color: '#3f74e6', contact: 'Chris Collier',   phone: '(208) 555-0107', status: 'new',     xdate: '—',      rep: 'Unassigned' },
  { id: 7,  co: 'Bender Group',       city: 'Fargo, ND',          initials: 'JB', color: '#2c9d78', contact: 'Jordan Bender',   phone: '(701) 555-0134', status: 'appt',    xdate: 'Nov 18', rep: 'Sean F.' },
  { id: 8,  co: 'Zimmermann Agency',  city: 'Wichita, KS',        initials: 'SZ', color: '#b7791f', contact: 'Sam Zimmermann',  phone: '(316) 555-0156', status: 'hot',     xdate: 'Sep 24', rep: 'R. Colestock' },
  { id: 9,  co: 'Meridian Partners',  city: 'Salt Lake City, UT', initials: 'MP', color: '#6d47c9', contact: 'Paula Reyes',     phone: '(801) 555-0188', status: 'survey',  xdate: 'Dec 03', rep: 'Mike P.' },
  { id: 10, co: 'Foxline Insurance',  city: 'Spokane, WA',        initials: 'FL', color: '#2b6cb0', contact: 'Erin Fox',        phone: '(509) 555-0121', status: 'xdate',   xdate: 'Jan 09', rep: 'Sean F.' },
];

export const recentLeads = leads.slice(0, 6);

export const clientSlug = (name) =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

export const clients = [
  { name: 'Garry Insurance',   city: 'Phoenix, AZ',        initials: 'GI', color: '#2b6cb0', leads: 31, appts: 8,  manager: 'Sean F.' },
  { name: 'Rural Insurance',   city: 'Cedar Rapids, IA',   initials: 'RI', color: '#2c9d78', leads: 44, appts: 11, manager: 'Mike P.' },
  { name: 'Insurance Pro AZ',  city: 'Tucson, AZ',         initials: 'IP', color: '#b7791f', leads: 27, appts: 6,  manager: 'R. Colestock' },
  { name: 'Summit Benefits',   city: 'Denver, CO',         initials: 'SB', color: '#6d47c9', leads: 38, appts: 9,  manager: 'Sean F.' },
  { name: 'Heartland Wealth',  city: 'Omaha, NE',          initials: 'HW', color: '#c1362c', leads: 22, appts: 5,  manager: 'Mike P.' },
  { name: 'Meridian Partners', city: 'Salt Lake City, UT', initials: 'MP', color: '#3f74e6', leads: 19, appts: 4,  manager: 'Mike P.' },
];

export const appointments = {
  today: [
    { time: '9:30',  ampm: 'AM', co: 'Garry Insurance',   detail: 'Phone appointment · Jeff Garry · 30 min',   repI: 'SF', repC: '#3f74e6', rep: 'Sean F.',      bar: 'bg-emerald-500' },
    { time: '11:00', ampm: 'AM', co: 'Rural Insurance',   detail: 'Survey appointment · Laura Meyer · 45 min',  repI: 'MP', repC: '#7c53d6', rep: 'Mike P.',      bar: 'bg-sky-500' },
    { time: '1:15',  ampm: 'PM', co: 'Insurance Pro AZ',  detail: 'X-date hot lead · Jeff Matthews · 30 min',   repI: 'RC', repC: '#2c9d78', rep: 'R. Colestock', bar: 'bg-rose-500' },
    { time: '3:45',  ampm: 'PM', co: 'Summit Benefits',   detail: 'Appt from X-date · Brian Vicini · 30 min',   repI: 'SF', repC: '#3f74e6', rep: 'Sean F.',      bar: 'bg-primary' },
  ],
  tomorrow: [
    { time: '10:00', ampm: 'AM', co: 'Bender Group',      detail: 'Phone appointment · Jordan Bender · 30 min', repI: 'SF', repC: '#3f74e6', rep: 'Sean F.', bar: 'bg-violet-500' },
    { time: '2:30',  ampm: 'PM', co: 'Meridian Partners', detail: 'Survey appointment · Paula Reyes · 45 min',  repI: 'MP', repC: '#7c53d6', rep: 'Mike P.', bar: 'bg-sky-500' },
  ],
};

export const reps = [
  { name: 'Sean F.',      appts: 46, pct: 92, color: 'bg-primary' },
  { name: 'Mike P.',      appts: 39, pct: 78, color: 'bg-violet-500' },
  { name: 'R. Colestock', appts: 33, pct: 66, color: 'bg-emerald-500' },
];

export const accountManagers = [
  { name: 'Sean F.',      initials: 'SF', color: '#3f74e6', region: 'West',      clients: 6, appts: 8,  leads: 112 },
  { name: 'Mike P.',      initials: 'MP', color: '#7c53d6', region: 'Midwest',   clients: 5, appts: 11, leads: 98 },
  { name: 'R. Colestock', initials: 'RC', color: '#2c9d78', region: 'Southwest', clients: 4, appts: 6,  leads: 74 },
  { name: 'Dana W.',      initials: 'DW', color: '#b7791f', region: 'Mountain',  clients: 2, appts: 3,  leads: 58 },
];

export const projects = [
  { id: 1, name: 'Q3 X-Date Renewals',  client: 'Garry Insurance',   type: 'DBDV', leads: 48, status: 'Active', manager: 'Sean F.',      color: '#2b6cb0' },
  { id: 2, name: 'Appt Setting — P&C',   client: 'Rural Insurance',   type: 'APPT', leads: 62, status: 'Active', manager: 'Mike P.',      color: '#2c9d78' },
  { id: 3, name: 'Medicare AEP Push',    client: 'Summit Benefits',   type: 'DBDV', leads: 35, status: 'Active', manager: 'Sean F.',      color: '#6d47c9' },
  { id: 4, name: 'Life X-Date Profile',  client: 'Heartland Wealth',  type: 'DBDV', leads: 22, status: 'Paused', manager: 'Mike P.',      color: '#c1362c' },
  { id: 5, name: 'Survey Campaign',      client: 'Insurance Pro AZ',  type: 'APPT', leads: 27, status: 'Active', manager: 'R. Colestock', color: '#b7791f' },
  { id: 6, name: 'Commercial Outbound',  client: 'Meridian Partners', type: 'APPT', leads: 19, status: 'Draft',  manager: 'Mike P.',      color: '#3f74e6' },
];

export const insuranceCompanies = [
  { name: 'Nationwide',      initials: 'NW', color: '#2b6cb0', lines: 'P&C, Life',    states: 12, xdates: 184, status: 'Preferred' },
  { name: 'Allstate',        initials: 'AL', color: '#2c9d78', lines: 'P&C',          states: 9,  xdates: 142, status: 'Active' },
  { name: 'Mutual of Omaha', initials: 'MO', color: '#6d47c9', lines: 'Life, Health', states: 7,  xdates: 96,  status: 'Active' },
  { name: 'Farmers',         initials: 'FA', color: '#b7791f', lines: 'P&C',          states: 6,  xdates: 88,  status: 'Active' },
  { name: 'Aetna',           initials: 'AE', color: '#c1362c', lines: 'Health',       states: 5,  xdates: 71,  status: 'Preferred' },
];

export const feedbackSummary = { avg: 4.3, total: 128, promoters: 71 };
export const feedback = [
  { client: 'Garry Insurance',  contact: 'Jeff Garry',   rating: 5, date: 'Aug 18', text: 'Leads have been consistently strong this quarter. Appointment quality is noticeably better.' },
  { client: 'Rural Insurance',  contact: 'Laura Meyer',  rating: 4, date: 'Aug 15', text: 'Good volume overall. A few X-dates were slightly off but the team corrected quickly.' },
  { client: 'Summit Benefits',  contact: 'Brian Vicini', rating: 5, date: 'Aug 12', text: 'Best month yet — show rate is up and the reps are well prepared for each call.' },
  { client: 'Heartland Wealth', contact: 'Dana Zinda',   rating: 3, date: 'Aug 09', text: 'Solid results, but we would like faster turnaround on the profile leads.' },
];

export const qaCalls = [
  { id: 1, rep: 'Sean F.',      client: 'Garry Insurance',  score: 96, result: 'Passed', date: 'Aug 19' },
  { id: 2, rep: 'Mike P.',      client: 'Rural Insurance',  score: 88, result: 'Passed', date: 'Aug 19' },
  { id: 3, rep: 'R. Colestock', client: 'Insurance Pro AZ', score: 73, result: 'Review', date: 'Aug 18' },
  { id: 4, rep: 'Mike P.',      client: 'Summit Benefits',  score: 91, result: 'Passed', date: 'Aug 18' },
  { id: 5, rep: 'Sean F.',      client: 'Heartland Wealth', score: 64, result: 'Failed', date: 'Aug 17' },
];

export const bulletin = [
  { author: 'Sean F.', initials: 'SF', color: '#3f74e6', time: '2h ago',     text: 'Reminder: the Q3 X-date renewal push wraps Friday. Prioritize hot leads with X-dates before Sep 15.' },
  { author: 'Mike P.', initials: 'MP', color: '#7c53d6', time: 'Yesterday',  text: 'New survey script is live for the Rural Insurance project. Please review it before your next block.' },
  { author: 'Admin',   initials: 'AD', color: '#2c9d78', time: '2 days ago', text: 'Office 365 mailbox password was rotated. Lead notification emails are back to normal.' },
];

export const documents = [
  { id: 1, name: 'Garry Insurance — Lead Sheet.pdf', type: 'PDF',  client: 'Garry Insurance', size: '248 KB', date: 'Aug 19' },
  { id: 2, name: 'Rural Insurance Contract.docx',    type: 'DOCX', client: 'Rural Insurance', size: '92 KB',  date: 'Aug 17' },
  { id: 3, name: 'Q3 Import — Leads.csv',            type: 'CSV',  client: '—',               size: '1.2 MB', date: 'Aug 15' },
  { id: 4, name: 'Summit Benefits Logo.png',         type: 'PNG',  client: 'Summit Benefits', size: '36 KB',  date: 'Aug 12' },
  { id: 5, name: 'AEP Campaign Brief.pdf',           type: 'PDF',  client: 'Summit Benefits', size: '410 KB', date: 'Aug 10' },
];

export const recentImports = [
  { id: 1, file: 'q3_xdate_leads.csv', rows: 1240, status: 'Complete',   date: 'Aug 15, 2:14 PM' },
  { id: 2, file: 'rural_survey.csv',   rows: 512,  status: 'Complete',   date: 'Aug 12, 9:03 AM' },
  { id: 3, file: 'medicare_aep.csv',   rows: 868,  status: 'Processing', date: 'Aug 20, 11:20 AM' },
  { id: 4, file: 'bad_format.xlsx',    rows: 0,    status: 'Failed',     date: 'Aug 09, 4:47 PM' },
];

export const alertRules = [
  { name: 'X-date hot lead',       desc: 'Email the client instantly when a hot X-date lead is set.', on: true },
  { name: 'Phone appointment set', desc: 'Notify the assigned rep and manager on new appointments.',  on: true },
  { name: 'Survey appointment',    desc: 'Send the survey sheet to the project email address.',         on: true },
  { name: 'Daily lead digest',     desc: 'Summary of the day’s delivered leads, sent at 6:00 PM.', on: false },
  { name: 'Failed email retry',    desc: 'Alert admins if lead notification emails fail to send.',      on: true },
];
export const recentAlerts = [
  { text: 'Hot lead emailed to Garry Insurance',       time: '9:32 AM',  tone: 'hot' },
  { text: 'Appointment alert sent to Sean F.',         time: '11:04 AM', tone: 'appt' },
  { text: 'Survey sheet delivered to Rural Insurance', time: '11:10 AM', tone: 'survey' },
  { text: 'Daily digest scheduled for 6:00 PM',        time: '—',        tone: 'new' },
];

export const users = [
  { id: 1, name: 'Sean Ferris',    email: 'seanf@signaturemktg.net',      initials: 'SF', color: '#3f74e6', role: 'Administrator', roleTone: 'admin',   iplock: true,  last: 'Today, 8:12 AM', status: 'Active' },
  { id: 2, name: 'Mike Patterson', email: 'mikep@signaturemktg.net',      initials: 'MP', color: '#7c53d6', role: 'Manager',       roleTone: 'manager', iplock: true,  last: 'Today, 7:45 AM', status: 'Active' },
  { id: 3, name: 'R. Colestock',   email: 'rcolestock@signaturemktg.net', initials: 'RC', color: '#2c9d78', role: 'Agent',         roleTone: 'agent',   iplock: false, last: 'Yesterday',      status: 'Active' },
  { id: 4, name: 'Jeff Garry',     email: 'jeff@garryinsurance.com',      initials: 'JG', color: '#2b6cb0', role: 'Client',        roleTone: 'client',  iplock: false, last: 'Aug 18',         status: 'Active' },
  { id: 5, name: 'Laura Meyer',    email: 'lmeyer@ruralins.com',          initials: 'LM', color: '#b7791f', role: 'Client',        roleTone: 'client',  iplock: false, last: 'Aug 12',         status: 'Invited' },
];
