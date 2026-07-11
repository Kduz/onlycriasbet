import { createClient } from '@supabase/supabase-js';

/**
 * Configure em `.env.local` (local) e na Vercel (produção):
 *   NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
 */
export const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
  'https://cxuyyllmdzymjeggughe.supabase.co';

export const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN4dXl5bGxtZHp5bWplZ2d1Z2hlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM2NDc0MTksImV4cCI6MjA5OTIyMzQxOX0.quuxNj6yiqdWXDfblQWsKVwOWS4K4b92_gndF1vTEic';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    'Supabase: defina NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY no .env.local'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/**
 * Diferença servidor − cliente (ms), usando o header Date da API Supabase.
 * Assim todos os jogadores alinham o ciclo do crash no mesmo relógio.
 */
export async function fetchServerTimeOffset(): Promise<number> {
  const clientBefore = Date.now();

  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/`, {
      method: 'HEAD',
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${supabaseAnonKey}`,
      },
      cache: 'no-store',
    });

    const clientAfter = Date.now();
    const dateHeader = res.headers.get('date');
    if (!dateHeader) return 0;

    const serverNow = new Date(dateHeader).getTime();
    if (Number.isNaN(serverNow)) return 0;

    const clientMid = (clientBefore + clientAfter) / 2;
    return serverNow - clientMid;
  } catch {
    return 0;
  }
}
