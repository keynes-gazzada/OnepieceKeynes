import type { NextConfig } from 'next';
const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR || '.next',
  serverExternalPackages: ['exceljs', 'nodemailer', 'pg'],
  outputFileTracingIncludes: { '/*': ['./supabase/certs/*.crt'] },
};
export default nextConfig;
