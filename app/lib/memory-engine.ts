/** Memoria dos Crias — jogo solo de pares com imagens. */

export type MemorySymbolId =
  | 'gem'
  | 'goblet'
  | 'key'
  | 'potion'
  | 'sword'
  | 'leaf'
  | 'ember'
  | 'crown';

export type MemoryCard = {
  id: string;
  symbol: MemorySymbolId;
  /** Par index 0..n-1 */
  pairKey: number;
};

export type MemoryPhase = 'betting' | 'playing' | 'won' | 'lost';

export const MEMORY_SYMBOLS: {
  id: MemorySymbolId;
  label: string;
  src: string;
}[] = [
  { id: 'gem', label: 'Gema', src: '/memory/pair-gem.jpg' },
  { id: 'goblet', label: 'Calice', src: '/memory/pair-goblet.jpg' },
  { id: 'key', label: 'Chave', src: '/memory/pair-key.jpg' },
  { id: 'potion', label: 'Pocao', src: '/memory/pair-potion.jpg' },
  { id: 'sword', label: 'Espada', src: '/memory/pair-sword.jpg' },
  { id: 'leaf', label: 'Folha', src: '/memory/pair-leaf.jpg' },
  { id: 'ember', label: 'Brasa', src: '/memory/pair-ember.jpg' },
  { id: 'crown', label: 'Coroa', src: '/memory/pair-crown.jpg' },
];

export const MEMORY_CARD_BACK = '/memory/card-back.jpg';

/** Quantidade de pares (8 pares = 16 cartas, grade 4x4). */
export const MEMORY_PAIR_COUNT = 8;

/**
 * Multiplo se completar todos os pares com lives restantes.
 * lives usadas nao entram no calculo — so se ganhou.
 */
export const MEMORY_WIN_MULT = 2;

/** Erros permitidos antes de perder. */
export const MEMORY_MAX_MISSES = 6;

export function symbolSrc(id: MemorySymbolId): string {
  return MEMORY_SYMBOLS.find((s) => s.id === id)?.src ?? MEMORY_CARD_BACK;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Monta o baralho: 2 cartas por simbolo, embaralhadas. */
export function createMemoryDeck(pairCount = MEMORY_PAIR_COUNT): MemoryCard[] {
  const picks = MEMORY_SYMBOLS.slice(0, pairCount);
  const cards: MemoryCard[] = [];
  picks.forEach((sym, pairKey) => {
    cards.push(
      { id: `${sym.id}-a-${pairKey}`, symbol: sym.id, pairKey },
      { id: `${sym.id}-b-${pairKey}`, symbol: sym.id, pairKey }
    );
  });
  return shuffle(cards);
}

export function memoryWinPayout(stake: number): number {
  return Math.floor(stake * MEMORY_WIN_MULT);
}
