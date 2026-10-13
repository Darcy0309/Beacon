/** @type {import('next').NextConfig} */
const nextConfig = {
  // undici is loaded natively so the Supabase connection pool in
  // src/lib/supabase/fetch.js is a single instance per server process.
  // nodemailer (src/lib/server/mail.js) speaks SMTP over Node's sockets, and
  // web-push (src/lib/server/push.js) uses Node's crypto and https.
  serverExternalPackages: ["undici", "nodemailer", "web-push"],
  experimental: {
    serverActions: {
      // A lead list is posted to its server action whole. The 1 MB default
      // refused a real book of business before the import ran; 4.5 MB is
      // Vercel's own request limit. The file cap is MAX_IMPORT_MB (src/lib/csv.js).
      bodySizeLimit: "4.5mb",
    },
  },
};

export default nextConfig;
