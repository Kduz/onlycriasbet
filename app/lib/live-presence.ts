/** Marcadores ao vivo nos jogos (saques, mortes, apostas). */

export type LiveMarkerKind = 'cashout' | 'crash' | 'bet';

export type LiveMarker = {
  id: string;
  kind: LiveMarkerKind;
  game: 'aviator' | 'roulette' | 'mines' | 'blackjack';
  playerId: string;
  playerLabel: string;
  roundIndex: number;
  /** Aviator: multiplo do saque/crash */
  multiplier?: number;
  amount?: number;
  /** Roleta: "red" | "black" | "white" | "n:7" */
  roulettePick?: string;
  /** Mines: score */
  score?: number;
  createdAt: number;
};

export const LIVE_CHANNEL = 'live-presence-v2';
export const LIVE_EVENT = 'marker';

export function shortName(label: string) {
  if (!label) return 'Jogador';
  const base = label.split('@')[0] || label;
  return base.length > 10 ? `${base.slice(0, 9)}…` : base;
}

export function newMarkerId() {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
