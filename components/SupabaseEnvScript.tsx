import { connection } from 'next/server';

export default async function SupabaseEnvScript() {
  await connection();

  const url = (
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    ''
  ).trim();

  const anonKey = (
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    ''
  ).trim();

  if (!url || !anonKey) {
    return null;
  }

  const payload = JSON.stringify({ url, anonKey }).replace(/</g, '\\u003c');

  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `window.__SIAP_SUPABASE_ENV__=${payload};`,
      }}
    />
  );
}
