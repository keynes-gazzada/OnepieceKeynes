export function database(): never {
  throw new Error('Cloudflare richiede DATABASE_DRIVER=postgres e SUPABASE_DATABASE_URL.');
}
