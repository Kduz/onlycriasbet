/** Timing global — todos os clientes usam o relógio do Supabase (offset). */
export const BETTING_MS = 10_000;
export const FLYING_MS = 16_000;
export const CRASHED_MS = 4_500;
export const CYCLE_MS = BETTING_MS + FLYING_MS + CRASHED_MS;
export const TICK_MS = 33;
/** Re-sincroniza o relógio com o servidor com mais frequência. */
export const SERVER_SYNC_MS = 8_000;

/** Canal/evento de hard-sync do crash (peers forçam a mesma explosão). */
export const AVIATOR_SYNC_CHANNEL = 'aviator-round-sync-v1';
export const AVIATOR_CRASH_EVENT = 'round_crash';

export type AviatorCrashBroadcast = {
  roundIndex: number;
  crashPoint: number;
  /** Instantâneo do servidor no momento do crash (ms). */
  serverNowMs: number;
  senderId?: string;
};

/**
 * mult = e^(GROWTH * t_segundos)
 * ~2x em ~2s, ~5x em ~3.2s
 */
export const GROWTH_RATE = 0.35;

export type Phase = 'betting' | 'flying' | 'crashed';

export type GameSnapshot = {
  phase: Phase;
  roundIndex: number;
  crashPoint: number;
  multiplier: number;
  msRemaining: number;
  phaseElapsed: number;
};

function seededRandom(seed: number) {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Distribuição equilibrada (estilo crash real):
 * - ~2% estouro quase na decolagem (1.00–1.05)
 * - maioria entre ~1.2x e ~8x
 * - multiplos altos existem, mas raros
 * House edge ~3%
 */
export function getCrashPoint(roundIndex: number) {
  const r = seededRandom(roundIndex * 9973 + 42);

  // Raro: estouro bem no começo
  if (r < 0.02) {
    return 1.0;
  }
  if (r < 0.04) {
    // 2% extra entre 1.01 e 1.15
    const u0 = seededRandom(roundIndex * 51 + 7);
    return Math.round((1.01 + u0 * 0.14) * 100) / 100;
  }

  // Uniforme no restante → fórmula clássica
  const u = (r - 0.04) / 0.96;
  const houseEdge = 0.03;
  let crash = (1 - houseEdge) / Math.max(1e-9, 1 - u);

  // Suave: evita extremos absurdos e multiplos ridículos
  crash = Math.max(1.1, Math.min(crash, 40));

  return Math.round(crash * 100) / 100;
}

/**
 * Tempo de voo coerente com o multiplo.
 * 1.00x → ~0.5s | 1.5x → ~1.15s | 2x → ~2s | 5x → ~4.6s
 */
export function getTimeToCrashMs(crashPoint: number) {
  if (crashPoint <= 1.0) return 500;
  if (crashPoint <= 1.08) return 650;

  const tSec = Math.log(Math.max(crashPoint, 1.01)) / GROWTH_RATE;
  const ms = tSec * 1000;
  const minT = 700;
  const maxT = FLYING_MS - 300;
  return Math.min(maxT, Math.max(minT, ms));
}

function getMultiplierAt(crashPoint: number, flyElapsedMs: number, timeToCrashMs: number) {
  if (flyElapsedMs >= timeToCrashMs) return crashPoint;
  if (crashPoint <= 1.0) return 1.0;

  const tSec = flyElapsedMs / 1000;
  const raw = Math.exp(GROWTH_RATE * tSec);
  return Math.min(crashPoint, Math.max(1, raw));
}

/** Instantâneo de servidor em que o multiplo estoura nesta rodada. */
export function getCrashServerMomentMs(roundIndex: number, crashPoint?: number) {
  const cp = crashPoint ?? getCrashPoint(roundIndex);
  return roundIndex * CYCLE_MS + BETTING_MS + getTimeToCrashMs(cp);
}

export function getGameSnapshot(now = Date.now()): GameSnapshot {
  // Garante ciclo positivo mesmo com relógio muito atrasado
  const safeNow = Math.max(0, now);
  const roundIndex = Math.floor(safeNow / CYCLE_MS);
  const elapsedInCycle = safeNow % CYCLE_MS;
  const crashPoint = getCrashPoint(roundIndex);
  const timeToCrashMs = getTimeToCrashMs(crashPoint);

  if (elapsedInCycle < BETTING_MS) {
    return {
      phase: 'betting',
      roundIndex,
      crashPoint,
      multiplier: 1,
      msRemaining: BETTING_MS - elapsedInCycle,
      phaseElapsed: elapsedInCycle,
    };
  }

  const flyElapsed = elapsedInCycle - BETTING_MS;

  if (flyElapsed < timeToCrashMs) {
    return {
      phase: 'flying',
      roundIndex,
      crashPoint,
      multiplier: getMultiplierAt(crashPoint, flyElapsed, timeToCrashMs),
      msRemaining: timeToCrashMs - flyElapsed,
      phaseElapsed: flyElapsed,
    };
  }

  const afterCrashElapsed = flyElapsed - timeToCrashMs;
  const crashDisplayTotal = FLYING_MS - timeToCrashMs + CRASHED_MS;
  const msRemaining = Math.max(0, crashDisplayTotal - afterCrashElapsed);

  return {
    phase: 'crashed',
    roundIndex,
    crashPoint,
    multiplier: crashPoint,
    msRemaining,
    phaseElapsed: afterCrashElapsed,
  };
}

/**
 * Força o snapshot em "crashed" (peer reportou estouro).
 * Mantém a mesma rodada e multiplo canónico.
 */
export function forceCrashedSnapshot(
  base: GameSnapshot,
  crashPoint: number,
  now: number
): GameSnapshot {
  const timeToCrashMs = getTimeToCrashMs(crashPoint);
  const crashMoment = base.roundIndex * CYCLE_MS + BETTING_MS + timeToCrashMs;
  const afterCrashElapsed = Math.max(0, now - crashMoment);
  const crashDisplayTotal = FLYING_MS - timeToCrashMs + CRASHED_MS;
  const msRemaining = Math.max(0, crashDisplayTotal - afterCrashElapsed);

  return {
    phase: 'crashed',
    roundIndex: base.roundIndex,
    crashPoint,
    multiplier: crashPoint,
    msRemaining,
    phaseElapsed: afterCrashElapsed,
  };
}

export function formatSeconds(ms: number) {
  return Math.max(0, Math.ceil(ms / 1000));
}
