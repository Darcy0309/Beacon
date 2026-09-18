/** @type {import('next').NextConfig} */
const nextConfig = {
  // undici is loaded natively so the Supabase connection pool in
  // lib/supabase/fetch.js is a single instance per server process.
  serverExternalPackages: ["undici"],
};

export default nextConfig;
