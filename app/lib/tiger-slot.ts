/**
 * Tigrinho dos Crias — grade 3x5, imagens "caem",
 * prémios em fileiras horizontais e diagonais.
 */

export const SLOT_ROWS = 3;
export const SLOT_COLS = 5;
export const SLOT_CELLS = SLOT_ROWS * SLOT_COLS;

export type SlotSymbolId =
  | 'tiger'
  | 'coins'
  | 'luck'
  | 'gem'
  | 'crown'
  | 'potion'
  | 'key';

export type SlotSymbol = {
  id: SlotSymbolId;
  label: string;
  src: string;
  /** Peso no sorteio (maior = mais comum) */
  weight: number;
  /** Multiplicador base por 3 iguais na linha */
  mult3: number;
  mult4: number;
  mult5: number;
};

/** Símbolos do tigrinho (ordem visual). */
export const SLOT_SYMBOLS: SlotSymbol[] = [
  {
    id: 'tiger',
    label: 'Tigre',
    src: '/slot/sym-tiger.jpg',
    weight: 4,
    mult3: 5,
    mult4: 15,
    mult5: 50,
  },
  {
    id: 'coins',
    label: 'Moedas',
    src: '/slot/sym-coins.jpg',
    weight: 8,
    mult3: 2.5,
    mult4: 6,
    mult5: 20,
  },
  {
    id: 'luck',
    label: 'Sorte',
    src: '/slot/sym-luck.jpg',
    weight: 9,
    mult3: 2,
    mult4: 5,
    mult5: 15,
  },
  {
    id: 'gem',
    label: 'Gema',
    src: '/slot/sym-gem.jpg',
    weight: 10,
    mult3: 1.8,
    mult4: 4,
    mult5: 12,
  },
  {
    id: 'crown',
    label: 'Coroa',
    src: '/slot/sym-crown.jpg',
    weight: 11,
    mult3: 1.5,
    mult4: 3.5,
    mult5: 10,
  },
  {
    id: 'potion',
    label: 'Pocao',
    src: '/slot/sym-potion.jpg',
    weight: 12,
    mult3: 1.4,
    mult4: 3,
    mult5: 8,
  },
  {
    id: 'key',
    label: 'Chave',
    src: '/slot/sym-key.jpg',
    weight: 14,
    mult3: 1.2,
    mult4: 2.5,
    mult5: 6,
  },
];

export type PaylineKind = 'row' | 'diag';

export type Payline = {
  id: string;
  kind: PaylineKind;
  label: string;
  /** Índices lineares 0..14 (row-major: r*COLS+c) */
  cells: number[];
};

/**
 * Fileiras (3) + diagonais principais e secundárias em cada bloco 3x3
 * e diagonais longas na grade 3x5.
 */
export function buildPaylines(): Payline[] {
  const lines: Payline[] = [];

  // 3 fileiras horizontais (5 células cada)
  for (let r = 0; r < SLOT_ROWS; r++) {
    const cells: number[] = [];
    for (let c = 0; c < SLOT_COLS; c++) cells.push(r * SLOT_COLS + c);
    lines.push({
      id: `row-${r}`,
      kind: 'row',
      label: `Fileira ${r + 1}`,
      cells,
    });
  }

  // Diagonais descendo (↘) a partir de cada coluna 0..2 na linha 0
  // e com comprimento 3 (grade tem 3 linhas)
  for (let startC = 0; startC <= SLOT_COLS - SLOT_ROWS; startC++) {
    const cells: number[] = [];
    for (let i = 0; i < SLOT_ROWS; i++) {
      cells.push(i * SLOT_COLS + (startC + i));
    }
    lines.push({
      id: `diag-down-${startC}`,
      kind: 'diag',
      label: `Diagonal ↘ ${startC + 1}`,
      cells,
    });
  }

  // Diagonais subindo (↗) a partir de cada coluna 0..2 na linha 2
  for (let startC = 0; startC <= SLOT_COLS - SLOT_ROWS; startC++) {
    const cells: number[] = [];
    for (let i = 0; i < SLOT_ROWS; i++) {
      cells.push((SLOT_ROWS - 1 - i) * SLOT_COLS + (startC + i));
    }
    lines.push({
      id: `diag-up-${startC}`,
      kind: 'diag',
      label: `Diagonal ↗ ${startC + 1}`,
      cells,
    });
  }

  return lines;
}

export const SLOT_PAYLINES = buildPaylines();

export type LineWin = {
  payline: Payline;
  symbol: SlotSymbolId;
  count: number;
  mult: number;
  cells: number[];
};

export type SpinResult = {
  grid: SlotSymbolId[];
  wins: LineWin[];
  totalMult: number;
};

function weightedPick(): SlotSymbolId {
  const total = SLOT_SYMBOLS.reduce((s, x) => s + x.weight, 0);
  let r = Math.random() * total;
  for (const sym of SLOT_SYMBOLS) {
    r -= sym.weight;
    if (r <= 0) return sym.id;
  }
  return SLOT_SYMBOLS[SLOT_SYMBOLS.length - 1].id;
}

export function spinGrid(): SlotSymbolId[] {
  return Array.from({ length: SLOT_CELLS }, () => weightedPick());
}

function getSymbol(id: SlotSymbolId): SlotSymbol {
  return SLOT_SYMBOLS.find((s) => s.id === id) ?? SLOT_SYMBOLS[0];
}

/**
 * Conta o maior run consecutivo do MESMO símbolo a partir da esquerda na linha.
 * (estilo slot clássico L→R)
 */
function leftRun(cells: number[], grid: SlotSymbolId[]): {
  symbol: SlotSymbolId;
  count: number;
  used: number[];
} {
  const first = grid[cells[0]];
  let count = 1;
  const used = [cells[0]];
  for (let i = 1; i < cells.length; i++) {
    if (grid[cells[i]] === first) {
      count++;
      used.push(cells[i]);
    } else break;
  }
  return { symbol: first, count, used };
}

function multFor(symbol: SlotSymbolId, count: number): number {
  if (count < 3) return 0;
  const s = getSymbol(symbol);
  if (count >= 5) return s.mult5;
  if (count >= 4) return s.mult4;
  return s.mult3;
}

export function evaluateSpin(grid: SlotSymbolId[]): SpinResult {
  const wins: LineWin[] = [];
  let totalMult = 0;

  for (const line of SLOT_PAYLINES) {
    const { symbol, count, used } = leftRun(line.cells, grid);
    // Em diagonais de 3 células, 3 iguais = vitória
    // Em fileiras de 5, 3/4/5 iguais da esquerda
    const need = line.kind === 'diag' ? 3 : 3;
    if (count < need) continue;
    const mult = multFor(symbol, count);
    if (mult <= 0) continue;
    wins.push({
      payline: line,
      symbol,
      count,
      mult,
      cells: used,
    });
    totalMult += mult;
  }

  // Cap de sanidade
  totalMult = Math.min(totalMult, 100);
  return { grid, wins, totalMult };
}

export function symbolSrc(id: SlotSymbolId): string {
  return getSymbol(id).src;
}

export function payoutForSpin(stake: number, totalMult: number): number {
  if (totalMult <= 0) return 0;
  return Math.floor(stake * totalMult);
}
