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

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}

/** Descarta outliers extremos (ex.: rede travada num ping). */
function trimmedMedian(values: number[]): number {
  if (values.length <= 2) return median(values);
  const s = [...values].sort((a, b) => a - b);
  const cut = Math.max(1, Math.floor(s.length * 0.2));
  if (s.length - 2 * cut < 1) return median(s);
  return median(s.slice(cut, s.length - cut));
}

/** Fallback: header Date (precisão ~1s). */
async function offsetFromDateHeader(): Promise<number> {
  const samples: number[] = [];
  for (let i = 0; i < 5; i++) {
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
      if (!dateHeader) continue;
      const serverNow = new Date(dateHeader).getTime();
      if (Number.isNaN(serverNow)) continue;
      // Date HTTP tem precisão de 1s — usa meio do RTT + meia precisão
      const clientMid = (clientBefore + clientAfter) / 2;
      samples.push(serverNow + 500 - clientMid);
    } catch {
      /* ignore */
    }
  }
  return samples.length ? trimmedMedian(samples) : 0;
}

async function sampleRpcOffsets(count: number): Promise<number[]> {
  const samples: number[] = [];
  let rpcMissing = false;

  for (let i = 0; i < count; i++) {
    if (rpcMissing) break;
    const clientBefore = Date.now();
    try {
      const { data, error } = await supabase.rpc('server_now_ms');
      const clientAfter = Date.now();

      if (error || data == null) {
        // Função ainda não criada no projeto → cai no fallback Date
        rpcMissing = true;
        break;
      }

      const serverNow = Number(data);
      if (!Number.isFinite(serverNow)) {
        rpcMissing = true;
        break;
      }

      // NTP simplificado: relógio do servidor no meio do RTT
      const clientMid = (clientBefore + clientAfter) / 2;
      const rtt = clientAfter - clientBefore;
      // Descarta pings absurdamente lentos (distorcem o mid-point)
      if (rtt > 2500) continue;
      samples.push(serverNow - clientMid);
    } catch {
      rpcMissing = true;
      break;
    }
    // espaçamento curto entre pings
    await new Promise((r) => setTimeout(r, 25));
  }

  return samples;
}

/** Offset em cache partilhado por todos os jogos. */
let cachedOffsetMs = 0;
let hasCachedOffset = false;
let lastSyncAt = 0;
let inFlight: Promise<number> | null = null;

/**
 * Offset = serverNow − clientNow (ms).
 * Preferência: RPC server_now_ms() com várias amostras (NTP simplificado).
 * Fallback: header Date do REST.
 * Suaviza saltos grandes para o Aviator não “pular” de fase.
 */
export async function fetchServerTimeOffset(force = false): Promise<number> {
  const now = Date.now();
  // Reutiliza sync recente (evita spam em vários jogos)
  if (!force && hasCachedOffset && now - lastSyncAt < 4_000) {
    return cachedOffsetMs;
  }
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      // 1ª sincronização: mais amostras; re-sync: 3 bastam
      const sampleCount = hasCachedOffset ? 3 : 7;
      const samples = await sampleRpcOffsets(sampleCount);

      let measured: number;
      if (samples.length >= 2) {
        measured = Math.round(trimmedMedian(samples));
      } else if (samples.length === 1) {
        measured = Math.round(samples[0]);
      } else {
        measured = Math.round(await offsetFromDateHeader());
      }

      if (hasCachedOffset) {
        const delta = measured - cachedOffsetMs;
        // Se o salto for pequeno, média ponderada; se grande, aceita medição (relógio do SO mudou)
        if (Math.abs(delta) < 400) {
          cachedOffsetMs = Math.round(cachedOffsetMs * 0.4 + measured * 0.6);
        } else if (Math.abs(delta) < 2500) {
          cachedOffsetMs = Math.round(cachedOffsetMs * 0.2 + measured * 0.8);
        } else {
          cachedOffsetMs = measured;
        }
      } else {
        cachedOffsetMs = measured;
        hasCachedOffset = true;
      }

      lastSyncAt = Date.now();
      return cachedOffsetMs;
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

/** Offset já medido (0 se ainda não sincronizou). */
export function getCachedServerOffset(): number {
  return cachedOffsetMs;
}

/**
 * Corrige o offset quando um peer reporta crash antes de nós:
 * se o crash “deveria” já ter acontecido no relógio do servidor,
 * puxamos o nosso relógio para a frente (estávamos atrasados).
 */
export function nudgeServerOffsetToward(targetServerNowMs: number, maxNudgeMs = 8000): number {
  const implied = targetServerNowMs - Date.now();
  const delta = implied - cachedOffsetMs;
  if (delta <= 40) return cachedOffsetMs; // não estamos atrasados
  const applied = Math.min(delta, maxNudgeMs);
  cachedOffsetMs = Math.round(cachedOffsetMs + applied);
  hasCachedOffset = true;
  lastSyncAt = Date.now();
  return cachedOffsetMs;
}

/** Horário alinhado ao servidor (ms). */
export function serverNow(offsetMs: number = cachedOffsetMs): number {
  return Date.now() + offsetMs;
}
