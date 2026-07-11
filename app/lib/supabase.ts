import { createClient } from '@supabase/supabase-js';

export const supabaseUrl = 'https://cxuyyllmdzymjeggughe.supabase.co';
export const supabaseAnonKey =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN4dXl5bGxtZHp5bWplZ2d1Z2hlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM2NDc0MTksImV4cCI6MjA5OTIyMzQxOX0.quuxNj6yiqdWXDfblQWsKVwOWS4K4b92_gndF1vTEic';

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

    // Compensa latência aproximando o instante do servidor ao meio do RTT
    const clientMid = (clientBefore + clientAfter) / 2;
    return serverNow - clientMid;
  } catch {
    return 0;
  }
}
