'use client';

import { useState, useEffect, useRef } from 'react';
import { AlertTriangle, ArrowLeft, Loader2 } from 'lucide-react';
import { fetchServerTimeOffset } from '../lib/supabase';
import { payAffiliateCommission } from '../lib/affiliate';
import {
  BETTING_MS,
  SERVER_SYNC_MS,
  TICK_MS,
  formatSeconds,
  getGameSnapshot,
  type GameSnapshot,
} from '../lib/crash-engine';
import CrashChart from './CrashChart';
import RichLeaderboard from './RichLeaderboard';
import { useGameToasts } from './GameToastProvider';
import DodgingButton from './DodgingButton';
import { useLiveMarkers } from '../hooks/useLiveMarkers';

type ProfileUser = {
  id: string;
  email?: string | null;
};

type AviatorGameProps = {
  user: ProfileUser;
  balance: number;
  onBalanceChange: (balance: number) => void;
  onBack?: () => void;
  updateBalance: (userId: string, balance: number) => Promise<{ error: Error | null }>;
};

const BET_PRESETS = [5, 10, 20, 50];

export default function AviatorGame({
  user,
  balance,
  onBalanceChange,
  onBack,
  updateBalance,
}: AviatorGameProps) {
  const { pushOutcome } = useGameToasts();
  const [game, setGame] = useState<GameSnapshot>(() => getGameSnapshot());
  const [betAmount, setBetAmount] = useState(5);
  const [activeBet, setActiveBet] = useState<{ roundIndex: number; amount: number } | null>(null);
  const [hasCashedOut, setHasCashedOut] = useState(false);
  const [lastWin, setLastWin] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [clockSynced, setClockSynced] = useState(false);

  const { markers, publish } = useLiveMarkers(
    'aviator',
    game.roundIndex,
    user.id,
    user.email
  );

  const prevRoundRef = useRef(game.roundIndex);
  const prevPhaseRef = useRef(game.phase);
  const activeBetRef = useRef(activeBet);
  const hasCashedOutRef = useRef(hasCashedOut);
  const serverOffsetRef = useRef(0);
  const lossNotifiedRef = useRef(false);
  const pushOutcomeRef = useRef(pushOutcome);
  const publishRef = useRef(publish);

  useEffect(() => {
    pushOutcomeRef.current = pushOutcome;
  }, [pushOutcome]);

  useEffect(() => {
    publishRef.current = publish;
  }, [publish]);

  useEffect(() => {
    activeBetRef.current = activeBet;
  }, [activeBet]);

  useEffect(() => {
    hasCashedOutRef.current = hasCashedOut;
  }, [hasCashedOut]);

  useEffect(() => {
    let cancelled = false;

    const sync = async () => {
      const offset = await fetchServerTimeOffset();
      if (cancelled) return;
      serverOffsetRef.current = offset;
      setClockSynced(true);
      setGame(getGameSnapshot(Date.now() + offset));
    };

    sync();
    const id = window.setInterval(sync, SERVER_SYNC_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  useEffect(() => {
    const tick = () => {
      const now = Date.now() + serverOffsetRef.current;
      const snapshot = getGameSnapshot(now);
      setGame(snapshot);

      if (snapshot.roundIndex !== prevRoundRef.current) {
        prevRoundRef.current = snapshot.roundIndex;
        setActiveBet(null);
        setHasCashedOut(false);
        setLastWin(null);
        setActionError(null);
        lossNotifiedRef.current = false;
      }

      const bet = activeBetRef.current;
      const cashed = hasCashedOutRef.current;

      if (
        snapshot.phase === 'crashed' &&
        prevPhaseRef.current === 'flying' &&
        bet?.roundIndex === snapshot.roundIndex &&
        !cashed &&
        !lossNotifiedRef.current
      ) {
        lossNotifiedRef.current = true;
        setLastWin(`Crash em ${snapshot.crashPoint.toFixed(2)}x — perdeu ${bet.amount} Kz`);
        pushOutcomeRef.current({
          kind: 'loss',
          amount: bet.amount,
          game: 'aviator',
          gameLabel: 'Aviator do Oliver Tree',
          detail: `crash ${snapshot.crashPoint.toFixed(2)}x`,
        });
        publishRef.current({
          kind: 'crash',
          game: 'aviator',
          roundIndex: snapshot.roundIndex,
          multiplier: snapshot.crashPoint,
          amount: bet.amount,
        });
      }

      prevPhaseRef.current = snapshot.phase;
    };

    tick();
    const id = window.setInterval(tick, TICK_MS);
    return () => window.clearInterval(id);
  }, []);

  const placeBet = async () => {
    if (actionLoading) return;
    setActionError(null);

    if (game.phase !== 'betting') {
      setActionError('Espere o cooldown de apostas.');
      return;
    }
    if (activeBet?.roundIndex === game.roundIndex) {
      setActionError('Você já apostou nesta rodada.');
      return;
    }
    if (betAmount < 1) {
      setActionError('Aposta mínima: 1 Kz.');
      return;
    }
    if (betAmount > balance) {
      setActionError('Saldo insuficiente.');
      return;
    }

    setActionLoading(true);
    const newBalance = balance - betAmount;
    const { error } = await updateBalance(user.id, newBalance);

    if (error) {
      setActionError(error.message);
      setActionLoading(false);
      return;
    }

    onBalanceChange(newBalance);
    setActiveBet({ roundIndex: game.roundIndex, amount: betAmount });
    setHasCashedOut(false);
    setLastWin(null);
    setActionLoading(false);
  };

  const cashOut = async () => {
    if (actionLoading) return;
    if (game.phase !== 'flying') return;
    if (!activeBet || activeBet.roundIndex !== game.roundIndex) return;
    if (hasCashedOut) return;

    setActionLoading(true);
    setActionError(null);
    const win = Math.floor(activeBet.amount * game.multiplier);
    const newBalance = balance + win;
    const { error } = await updateBalance(user.id, newBalance);

    if (error) {
      setActionError(error.message);
      setActionLoading(false);
      return;
    }

    onBalanceChange(newBalance);
    setHasCashedOut(true);
    lossNotifiedRef.current = true; // não notificar perda depois do saque

    const multLabel = `${game.multiplier.toFixed(2)}x`;
    pushOutcome({
      kind: 'win',
      amount: win,
      game: 'aviator',
      gameLabel: 'Aviator do Oliver Tree',
      detail: `sacou em ${multLabel}`,
    });
    publish({
      kind: 'cashout',
      game: 'aviator',
      roundIndex: game.roundIndex,
      multiplier: game.multiplier,
      amount: win,
    });

    const commission = await payAffiliateCommission(user.id, win);
    const affiliateNote = commission > 0 ? ` · afiliado +${commission} Kz` : '';
    setLastWin(`Sacou em ${multLabel} → +${win} Kz${affiliateNote}`);
    setActionLoading(false);
  };

  const hasBetThisRound = activeBet?.roundIndex === game.roundIndex;
  const canCashOut = game.phase === 'flying' && hasBetThisRound && !hasCashedOut;
  const canBet = game.phase === 'betting' && !hasBetThisRound && !actionLoading;

  const statusText =
    game.phase === 'betting'
      ? `Apostas · ${formatSeconds(game.msRemaining)}s`
      : game.phase === 'flying'
        ? 'No ar — saque a tempo'
        : `Crash ${game.crashPoint.toFixed(2)}x · ${formatSeconds(game.msRemaining)}s`;

  const potentialWin =
    hasBetThisRound && activeBet
      ? Math.floor(activeBet.amount * game.multiplier)
      : Math.floor(betAmount * Math.max(game.multiplier, 1));

  return (
    <div className="aviator-page">
      {/* Compact top bar */}
      <div className="aviator-top">
        <div className="flex items-center gap-2 min-w-0">
          {onBack && (
            <button type="button" onClick={onBack} className="btn btn-ghost btn-sm shrink-0">
              <ArrowLeft size={16} />
              <span className="hidden xs:inline sm:inline">Voltar</span>
            </button>
          )}
          <div className="min-w-0">
            <h1 className="text-base sm:text-lg font-bold truncate">Aviator do Oliver Tree</h1>
            <p className="text-[11px] sm:text-xs text-[var(--muted)] truncate">{statusText}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap justify-end">
          <span className="badge badge-info">#{game.roundIndex}</span>
          <span className={`badge ${clockSynced ? 'badge-live' : 'badge-warn'}`}>
            {clockSynced ? 'Sync' : '...'}
          </span>
          <span className="badge badge-live">{balance} Kz</span>
        </div>
      </div>

      <div className="aviator-grid">
        {/* Game column */}
        <div className="aviator-main space-y-2.5 sm:space-y-3">
          <section className="game-stage game-stage-compact glow-purple" aria-live="polite">
            <div className="chart-with-mult">
              <CrashChart
                phase={game.phase}
                multiplier={game.multiplier}
                crashPoint={game.crashPoint}
                roundIndex={game.roundIndex}
                markers={markers}
              />
              <div
                className={`chart-mult-overlay ${
                  game.phase === 'crashed'
                    ? 'multiplier-crash'
                    : game.phase === 'flying'
                      ? 'multiplier-fly'
                      : 'multiplier-idle'
                }`}
              >
                {game.phase === 'betting' ? '1.00x' : `${game.multiplier.toFixed(2)}x`}
              </div>
            </div>

            {(hasBetThisRound || lastWin || actionError) && (
              <div className="mt-2 space-y-1.5">
                {hasBetThisRound && !hasCashedOut && game.phase === 'flying' && activeBet && (
                  <p className="text-xs sm:text-sm text-purple-200 text-center">
                    Em jogo <strong>{activeBet.amount} Kz</strong> · agora{' '}
                    <strong>{potentialWin} Kz</strong>
                  </p>
                )}
                {hasBetThisRound && hasCashedOut && (
                  <p className="text-xs sm:text-sm text-[var(--success)] text-center font-medium">
                    Já sacou nesta rodada
                  </p>
                )}
                {lastWin && (
                  <div
                    className={`banner banner-tight ${
                      lastWin.includes('perdeu') ? 'banner-danger' : 'banner-success'
                    }`}
                  >
                    {lastWin}
                  </div>
                )}
                {actionError && (
                  <div className="banner banner-tight banner-danger" role="alert">
                    {actionError}
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Compact phase */}
          <div className="phase-track phase-track-compact" aria-hidden>
            <div
              className={`phase-step phase-step-bet ${game.phase === 'betting' ? 'phase-step-active' : ''}`}
            >
              Apostas {BETTING_MS / 1000}s
            </div>
            <div
              className={`phase-step phase-step-fly ${game.phase === 'flying' ? 'phase-step-active' : ''}`}
            >
              Voo
            </div>
            <div
              className={`phase-step phase-step-crash ${game.phase === 'crashed' ? 'phase-step-active' : ''}`}
            >
              Crash
            </div>
          </div>

          {/* Controls */}
          <section className="surface p-3 sm:p-4 space-y-2.5">
            {game.phase === 'betting' && !hasBetThisRound && (
              <>
                <div className="bet-row">
                  <input
                    id="bet"
                    type="number"
                    min={1}
                    max={balance}
                    value={betAmount}
                    onChange={(e) => setBetAmount(Math.max(0, Number(e.target.value)))}
                    className="input-field text-center text-lg font-bold mono bet-input"
                    aria-label="Valor da aposta"
                  />
                  <button
                    type="button"
                    onClick={placeBet}
                    disabled={!canBet || betAmount < 1 || betAmount > balance}
                    className="btn btn-purple bet-submit"
                  >
                    {actionLoading ? (
                      <Loader2 className="animate-spin" size={18} />
                    ) : (
                      `Apostar ${betAmount}`
                    )}
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {BET_PRESETS.map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setBetAmount(v)}
                      disabled={v > balance}
                      className={`chip chip-sm ${betAmount === v ? 'chip-active' : ''}`}
                    >
                      {v}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setBetAmount(Math.max(1, Math.floor(balance / 2)))}
                    disabled={balance < 1}
                    className="chip chip-sm"
                  >
                    ½
                  </button>
                  <button
                    type="button"
                    onClick={() => setBetAmount(Math.max(1, balance))}
                    disabled={balance < 1}
                    className="chip chip-sm"
                  >
                    Max
                  </button>
                </div>
              </>
            )}

            {game.phase === 'betting' && hasBetThisRound && (
              <div className="banner banner-tight banner-warn text-center">
                Aposta de <strong>{activeBet?.amount} Kz</strong> ok — aguarde decolagem
              </div>
            )}

            {canCashOut && (
              <DodgingButton
                active={canCashOut}
                dodgeChance={0.075}
                onClick={cashOut}
                disabled={actionLoading}
                className="btn btn-success w-full text-base min-h-[48px]"
              >
                {actionLoading ? (
                  <Loader2 className="animate-spin" size={18} />
                ) : (
                  `Sacar ${game.multiplier.toFixed(2)}x → ${potentialWin} Kz`
                )}
              </DodgingButton>
            )}

            {game.phase === 'flying' && !hasBetThisRound && (
              <div className="banner banner-tight banner-info text-center">
                Sem aposta nesta rodada — espere o cooldown
              </div>
            )}

            {game.phase === 'crashed' && !hasBetThisRound && !lastWin && (
              <div className="banner banner-tight banner-info text-center">
                Próximas apostas em {formatSeconds(game.msRemaining)}s
              </div>
            )}
          </section>

          <p className="text-center text-[11px] text-[var(--muted)] flex items-center justify-center gap-1">
            <AlertTriangle size={11} className="text-[var(--danger)]" />
            Sátira · sem dinheiro real
          </p>
        </div>

        {/* Um único ranking (evita crash de canal Realtime duplicado) */}
        <aside className="aviator-side">
          <div className="aviator-side-sticky">
            <RichLeaderboard currentUserId={user.id} limit={10} compact />
          </div>
        </aside>
      </div>
    </div>
  );
}
