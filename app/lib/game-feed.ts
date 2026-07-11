/** Eventos de ganho/perda — reutilizável em todos os jogos */

export type GameOutcomeKind = 'win' | 'loss';

export type GameOutcomePayload = {
  id: string;
  kind: GameOutcomeKind;
  amount: number;
  game: string;
  gameLabel: string;
  playerId: string;
  playerLabel: string;
  detail?: string;
  createdAt: number;
};

export type PushOutcomeInput = {
  kind: GameOutcomeKind;
  amount: number;
  game: string;
  gameLabel: string;
  detail?: string;
};

export const GAME_FEED_CHANNEL = 'game-outcomes-v1';
export const GAME_FEED_EVENT = 'outcome';

export function maskPlayerLabel(email?: string | null) {
  if (!email) return 'Jogador';
  const [user, domain] = email.split('@');
  if (!domain) return email.slice(0, 8);
  return `${user.slice(0, 2)}***@${domain}`;
}

export function formatOutcomeText(o: GameOutcomePayload & { isSelf?: boolean }) {
  const who = o.isSelf ? 'Você' : o.playerLabel;
  const value = `${o.amount.toLocaleString('pt-BR')} Kz`;
  if (o.kind === 'win') {
    return o.detail
      ? `${who} ganhou ${value} · ${o.detail}`
      : `${who} ganhou ${value}`;
  }
  return o.detail
    ? `${who} perdeu ${value} · ${o.detail}`
    : `${who} perdeu ${value}`;
}
