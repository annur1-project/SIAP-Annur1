import { connection, NextResponse } from 'next/server';

export async function GET() {
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

  return NextResponse.json(
    { url, anonKey },
    {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      },
    }
  );
}
