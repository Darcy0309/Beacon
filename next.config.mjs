/** @type {import('next').NextConfig} */
const nextConfig = {
  // undici is loaded natively so the Supabase connection pool in
  // src/lib/supabase/fetch.js is a single instance per server process.
  // nodemailer (src/lib/server/mail.js) speaks SMTP over Node's sockets, and
  // web-push (src/lib/server/push.js) uses Node's crypto and https.
  serverExternalPackages: ["undici", "nodemailer", "web-push"],
};

export default nextConfig;
