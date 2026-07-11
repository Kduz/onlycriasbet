/** Blackjack 21 — solo (jogador vs banca). */

export type Suit = 'spades' | 'hearts' | 'diamonds' | 'clubs';
export type Rank =
  | 'A'
  | '2'
  | '3'
  | '4'
  | '5'
  | '6'
  | '7'
  | '8'
  | '9'
  | '10'
  | 'J'
  | 'Q'
  | 'K';

export type Card = {
  suit: Suit;
  rank: Rank;
  /** id único na mão (mesma carta pode aparecer em multi-baralho) */
  id: string;
};

export type HandResult =
  | 'player_blackjack'
  | 'dealer_blackjack'
  | 'player_win'
  | 'dealer_win'
  | 'push'
  | 'player_bust'
  | 'dealer_bust';

export type BjPhase = 'betting' | 'playing' | 'dealer' | 'result';

const SUITS: Suit[] = ['spades', 'hearts', 'diamonds', 'clubs'];
const RANKS: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

export const SUIT_SYMBOL: Record<Suit, string> = {
  spades: '♠',
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
};

export function isRedSuit(suit: Suit) {
  return suit === 'hearts' || suit === 'diamonds';
}

export function rankValue(rank: Rank): number {
  if (rank === 'A') return 11;
  if (rank === 'J' || rank === 'Q' || rank === 'K') return 10;
  return Number(rank);
}

/** Valor da mão (Ás conta 11 ou 1 automaticamente). */
export function handValue(cards: Card[]): { total: number; soft: boolean } {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    if (c.rank === 'A') {
      aces += 1;
      total += 11;
    } else {
      total += rankValue(c.rank);
    }
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces -= 1;
  }
  const soft = aces > 0 && total <= 21;
  return { total, soft };
}

export function isBlackjack(cards: Card[]) {
  return cards.length === 2 && handValue(cards).total === 21;
}

export function isBust(cards: Card[]) {
  return handValue(cards).total > 21;
}

/** Dealer hit soft 17? Stand on all 17+. */
export function dealerShouldHit(cards: Card[]) {
  const { total } = handValue(cards);
  return total < 17;
}

let cardSeq = 0;

function makeCard(suit: Suit, rank: Rank): Card {
  cardSeq += 1;
  return { suit, rank, id: `${rank}-${suit}-${cardSeq}-${Math.random().toString(36).slice(2, 7)}` };
}

/** Embaralha n baralhos (Fisher–Yates). */
export function createShoe(decks = 4): Card[] {
  const shoe: Card[] = [];
  for (let d = 0; d < decks; d++) {
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        shoe.push(makeCard(suit, rank));
      }
    }
  }
  for (let i = shoe.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shoe[i], shoe[j]] = [shoe[j], shoe[i]];
  }
  return shoe;
}

export function drawCard(shoe: Card[]): { card: Card; shoe: Card[] } {
  if (shoe.length === 0) {
    const fresh = createShoe(4);
    const [card, ...rest] = fresh;
    return { card, shoe: rest };
  }
  const [card, ...rest] = shoe;
  return { card, shoe: rest };
}

/**
 * Payout bruto creditado (inclui a aposta de volta, exceto push que devolve só o stake).
 * - Blackjack natural: 2.5x stake (3:2 + aposta)
 * - Vitória normal / dealer bust: 2x stake
 * - Push: 1x stake (devolve)
 * - Derrota / bust: 0
 */
export function payoutForResult(result: HandResult, stake: number): number {
  switch (result) {
    case 'player_blackjack':
      return Math.floor(stake * 2.5);
    case 'player_win':
    case 'dealer_bust':
      return stake * 2;
    case 'push':
      return stake;
    default:
      return 0;
  }
}

export function resolveHands(player: Card[], dealer: Card[]): HandResult {
  const pBj = isBlackjack(player);
  const dBj = isBlackjack(dealer);

  if (pBj && dBj) return 'push';
  if (pBj) return 'player_blackjack';
  if (dBj) return 'dealer_blackjack';

  if (isBust(player)) return 'player_bust';
  if (isBust(dealer)) return 'dealer_bust';

  const p = handValue(player).total;
  const d = handValue(dealer).total;
  if (p > d) return 'player_win';
  if (d > p) return 'dealer_win';
  return 'push';
}

export function resultLabel(result: HandResult): string {
  switch (result) {
    case 'player_blackjack':
      return 'Blackjack! 21 natural';
    case 'dealer_blackjack':
      return 'Banca tem Blackjack';
    case 'player_win':
      return 'Você venceu';
    case 'dealer_win':
      return 'Banca venceu';
    case 'push':
      return 'Empate — aposta devolvida';
    case 'player_bust':
      return 'Estourou (bust)';
    case 'dealer_bust':
      return 'Banca estourou';
    default:
      return '';
  }
}

export function formatHandTotal(cards: Card[], hideHole = false): string {
  if (cards.length === 0) return '—';
  if (hideHole && cards.length >= 1) {
    return `${rankValue(cards[0].rank)}+?`;
  }
  const { total, soft } = handValue(cards);
  if (soft && total <= 21) return `${total} soft`;
  return String(total);
}
