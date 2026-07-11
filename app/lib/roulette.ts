/** Roleta dos Crias — global em tempo real (mesmo relógio do crash). */

export type RouletteColor = 'red' | 'black' | 'white';

export type RouletteBetTarget =
  | { type: 'color'; color: RouletteColor }
  | { type: 'number'; number: number };

export type WheelSlot = {
  number: number;
  color: RouletteColor;
};

export type RoulettePhase = 'betting' | 'spinning' | 'result';

export type RouletteSnapshot = {
  phase: RoulettePhase;
  roundIndex: number;
  result: WheelSlot;
  resultIndex: number;
  msRemaining: number;
  /** 0–1 durante o giro */
  spinProgress: number;
  /** rotação da roda (graus) */
  wheelDeg: number;
  /** ângulo da bolinha no trilho (graus, 0 = topo) */
  ballDeg: number;
  phaseElapsed: number;
};

/** Multiplicadores (inclui a aposta de volta). */
export const ROULETTE_MULT = {
  red: 2,
  black: 2,
  white: 14,
  number: 36,
} as const;

/** 0 branco + 1–12 vermelho/preto (estilo europeu curto). */
export const WHEEL: WheelSlot[] = [
  { number: 0, color: 'white' },
  { number: 1, color: 'red' },
  { number: 2, color: 'black' },
  { number: 3, color: 'red' },
  { number: 4, color: 'black' },
  { number: 5, color: 'red' },
  { number: 6, color: 'black' },
  { number: 7, color: 'red' },
  { number: 8, color: 'black' },
  { number: 9, color: 'red' },
  { number: 10, color: 'black' },
  { number: 11, color: 'red' },
  { number: 12, color: 'black' },
];

export const SLOT_COUNT = WHEEL.length;
export const SLOT_STEP = 360 / SLOT_COUNT;

export const ROULETTE_BET_MS = 12_000;
export const ROULETTE_SPIN_MS = 9_500;
export const ROULETTE_RESULT_MS = 6_000;
export const ROULETTE_CYCLE_MS =
  ROULETTE_BET_MS + ROULETTE_SPIN_MS + ROULETTE_RESULT_MS;
export const ROULETTE_TICK_MS = 32;

export const COLOR_LABEL: Record<RouletteColor, string> = {
  red: 'Vermelho',
  black: 'Preto',
  white: 'Branco',
};

function seededRandom(seed: number) {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/** Resultado idêntico em todos os clientes para a rodada. */
export function getRoundResult(roundIndex: number): { slot: WheelSlot; index: number } {
  const r = seededRandom(roundIndex * 9973 + 17);
  const index = Math.floor(r * SLOT_COUNT) % SLOT_COUNT;
  return { slot: WHEEL[index], index };
}

export function evaluateBet(
  target: RouletteBetTarget,
  result: WheelSlot
): { won: boolean; mult: number; payout: number } {
  if (target.type === 'color') {
    const won = result.color === target.color;
    const mult = ROULETTE_MULT[target.color];
    return { won, mult, payout: won ? mult : 0 };
  }
  const won = result.number === target.number;
  return { won, mult: ROULETTE_MULT.number, payout: won ? ROULETTE_MULT.number : 0 };
}

export function colorHex(c: RouletteColor) {
  if (c === 'red') return '#be123c';
  if (c === 'black') return '#0c0a09';
  return '#f5f5f4';
}

export function colorAccent(c: RouletteColor) {
  if (c === 'red') return '#fb7185';
  if (c === 'black') return '#a8a29e';
  return '#e7e5e4';
}

/** Centro do setor no conic-gradient (from -90deg = topo). */
export function slotCenterFromTop(index: number) {
  return index * SLOT_STEP + SLOT_STEP / 2;
}

function easeOutCubic(t: number) {
  return 1 - Math.pow(1 - t, 3);
}

function easeOutQuint(t: number) {
  return 1 - Math.pow(1 - t, 5);
}

/**
 * Roda gira no sentido horário (valores positivos CSS).
 * Bolinha no trilho, 0° = topo (ponteiro).
 * No fim: centro do número vencedor sob o ponteiro + bolinha no bolso.
 */
export function getSpinAngles(resultIndex: number, progress01: number) {
  const t = Math.min(1, Math.max(0, progress01));
  const wheelEase = easeOutCubic(t);
  const ballEase = easeOutQuint(t);

  // Leva o centro do setor vencedor ao topo
  const finalWheel = -slotCenterFromTop(resultIndex);
  const wheelTurns = 4 + (resultIndex % 3); // voltas extras estáveis por seed visual
  const startWheel = finalWheel - wheelTurns * 360;
  const wheelDeg = startWheel + (finalWheel - startWheel) * wheelEase;

  // Bolinha: várias voltas no sentido contrário e pousa no topo (0°)
  const finalBall = 0;
  const ballTurns = 9 + (resultIndex % 4);
  const startBall = finalBall + ballTurns * 360;
  const ballDeg = startBall + (finalBall - startBall) * ballEase;

  return { wheelDeg, ballDeg };
}

export function getRouletteSnapshot(now = Date.now()): RouletteSnapshot {
  const roundIndex = Math.floor(now / ROULETTE_CYCLE_MS);
  const elapsed = now % ROULETTE_CYCLE_MS;
  const { slot, index } = getRoundResult(roundIndex);

  if (elapsed < ROULETTE_BET_MS) {
    return {
      phase: 'betting',
      roundIndex,
      result: slot,
      resultIndex: index,
      msRemaining: ROULETTE_BET_MS - elapsed,
      spinProgress: 0,
      wheelDeg: -slotCenterFromTop(index),
      ballDeg: 0,
      phaseElapsed: elapsed,
    };
  }

  if (elapsed < ROULETTE_BET_MS + ROULETTE_SPIN_MS) {
    const spinElapsed = elapsed - ROULETTE_BET_MS;
    const spinProgress = spinElapsed / ROULETTE_SPIN_MS;
    const { wheelDeg, ballDeg } = getSpinAngles(index, spinProgress);
    return {
      phase: 'spinning',
      roundIndex,
      result: slot,
      resultIndex: index,
      msRemaining: ROULETTE_SPIN_MS - spinElapsed,
      spinProgress,
      wheelDeg,
      ballDeg,
      phaseElapsed: spinElapsed,
    };
  }

  const resultElapsed = elapsed - ROULETTE_BET_MS - ROULETTE_SPIN_MS;
  const { wheelDeg, ballDeg } = getSpinAngles(index, 1);
  return {
    phase: 'result',
    roundIndex,
    result: slot,
    resultIndex: index,
    msRemaining: ROULETTE_RESULT_MS - resultElapsed,
    spinProgress: 1,
    wheelDeg,
    ballDeg,
    phaseElapsed: resultElapsed,
  };
}

export function formatSeconds(ms: number) {
  return Math.max(0, Math.ceil(ms / 1000));
}
