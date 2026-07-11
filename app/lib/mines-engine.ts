/** Mines do Minecraft — rodadas globais; mais diamantes (sem explodir) vence. */

export type MinesPhase = 'betting' | 'playing' | 'result';

export type MinesSnapshot = {
  phase: MinesPhase;
  roundIndex: number;
  msRemaining: number;
  mineCount: number;
  gridSize: number;
  /** true = bomba nessa célula (índice linear) */
  mines: boolean[];
};

export const MINES_GRID = 5;
export const MINES_BOMBS = 5;
export const MINES_CELLS = MINES_GRID * MINES_GRID;

export const MINES_BET_MS = 12_000;
export const MINES_PLAY_MS = 40_000;
export const MINES_RESULT_MS = 8_000;
export const MINES_CYCLE_MS = MINES_BET_MS + MINES_PLAY_MS + MINES_RESULT_MS;
export const MINES_TICK_MS = 50;

function seededRandom(seed: number) {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/** Mapa de minas idêntico pra todos na rodada. */
export function getMineMap(roundIndex: number): boolean[] {
  const mines = Array(MINES_CELLS).fill(false);
  const positions: number[] = [];
  let i = 0;
  while (positions.length < MINES_BOMBS && i < 200) {
    const r = seededRandom(roundIndex * 7919 + i * 97 + 3);
    const idx = Math.floor(r * MINES_CELLS);
    if (!mines[idx]) {
      mines[idx] = true;
      positions.push(idx);
    }
    i++;
  }
  return mines;
}

export function getMinesSnapshot(now = Date.now()): MinesSnapshot {
  const roundIndex = Math.floor(now / MINES_CYCLE_MS);
  const elapsed = now % MINES_CYCLE_MS;
  const mines = getMineMap(roundIndex);

  if (elapsed < MINES_BET_MS) {
    return {
      phase: 'betting',
      roundIndex,
      msRemaining: MINES_BET_MS - elapsed,
      mineCount: MINES_BOMBS,
      gridSize: MINES_GRID,
      mines,
    };
  }

  if (elapsed < MINES_BET_MS + MINES_PLAY_MS) {
    return {
      phase: 'playing',
      roundIndex,
      msRemaining: MINES_BET_MS + MINES_PLAY_MS - elapsed,
      mineCount: MINES_BOMBS,
      gridSize: MINES_GRID,
      mines,
    };
  }

  return {
    phase: 'result',
    roundIndex,
    msRemaining: MINES_CYCLE_MS - elapsed,
    mineCount: MINES_BOMBS,
    gridSize: MINES_GRID,
    mines,
  };
}

/**
 * Multiplo só pra exibição / referência.
 * Vitória da rodada usa **quantidade de diamantes**, não o multiplo.
 */
export function minesMultiplier(gems: number, bombs = MINES_BOMBS, cells = MINES_CELLS) {
  if (gems <= 0) return 1;
  let mult = 1;
  for (let i = 0; i < gems; i++) {
    const safeLeft = cells - bombs - i;
    const totalLeft = cells - i;
    if (safeLeft <= 0 || totalLeft <= 0) break;
    mult *= (totalLeft / safeLeft) * 0.97;
  }
  return Math.max(1, Math.round(mult * 100) / 100);
}

export function formatSeconds(ms: number) {
  return Math.max(0, Math.ceil(ms / 1000));
}

export type MinesScoreEntry = {
  playerId: string;
  playerLabel: string;
  roundIndex: number;
  /** Quantidade de diamantes (gemas). Explodiu = 0. */
  diamonds: number;
  stake: number;
  status: 'cashed' | 'bombed' | 'playing';
};

/**
 * Ganha quem tiver **mais diamantes sem explodir**.
 * Empate divide o pot.
 * Explodiu (bombed) não concorre.
 */
export function resolveMinesWinners(entries: MinesScoreEntry[]) {
  const active = entries.filter((e) => e.stake > 0);
  if (active.length === 0) {
    return { winners: [] as MinesScoreEntry[], pot: 0, prizeEach: 0, maxDiamonds: 0 };
  }

  const pot = active.reduce((s, e) => s + e.stake, 0);

  // Só quem não explodiu e tem diamantes travados (cashed) ou ainda playing no fim
  const contenders = active.filter(
    (e) => e.status !== 'bombed' && e.diamonds > 0
  );

  if (contenders.length === 0) {
    return { winners: [], pot, prizeEach: 0, maxDiamonds: 0 };
  }

  const maxDiamonds = Math.max(...contenders.map((e) => e.diamonds));
  const winners = contenders.filter((e) => e.diamonds === maxDiamonds);
  const prizeEach = Math.floor(pot / winners.length);
  return { winners, pot, prizeEach, maxDiamonds };
}
