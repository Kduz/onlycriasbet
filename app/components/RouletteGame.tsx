'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, ArrowLeft, Loader2 } from 'lucide-react';
import { fetchServerTimeOffset } from '../lib/supabase';
import {
  COLOR_LABEL,
  ROULETTE_BET_MS,
  ROULETTE_MULT,
  ROULETTE_TICK_MS,
  WHEEL,
  evaluateBet,
  formatSeconds,
  getRouletteSnapshot,
  type RouletteBetTarget,
  type RouletteColor,
  type RouletteSnapshot,
} from '../lib/roulette';
import { SERVER_SYNC_MS } from '../lib/crash-engine';
import { useGameToasts } from './GameToastProvider';
import RouletteWheel from './RouletteWheel';
import RichLeaderboard from './RichLeaderboard';
import { useLiveMarkers } from '../hooks/useLiveMarkers';
import { shortName } from '../lib/live-presence';

type ProfileUser = {
  id: string;
  email?: string | null;
};

type RouletteGameProps = {
  user: ProfileUser;
  balance: number;
  onBalanceChange: (balance: number) => void;
  onBack?: () => void;
  updateBalance: (userId: string, balance: number) => Promise<{ error: Error | null }>;
};

const BET_PRESETS = [5, 10, 20, 50];

export default function RouletteGame({
  user,
  balance,
  onBalanceChange,
  onBack,
  updateBalance,
}: RouletteGameProps) {
  const { pushOutcome } = useGameToasts();
  const [snap, setSnap] = useState<RouletteSnapshot>(() => getRouletteSnapshot());
  const [betAmount, setBetAmount] = useState(5);
  const [target, setTarget] = useState<RouletteBetTarget>({ type: 'color', color: 'red' });
  const [activeBet, setActiveBet] = useState<{
    roundIndex: number;
    amount: number;
    target: RouletteBetTarget;
    balanceAfterDebit: number;
  } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [clockSynced, setClockSynced] = useState(false);

  const { markers, publish } = useLiveMarkers(
    'roulette',
    // round atual — re-cria filtro a cada tick via snap abaixo; usa 0 inicial
    snap.roundIndex,
    user.id,
    user.email
  );

  const serverOffsetRef = useRef(0);
  const settledRoundRef = useRef<number | null>(null);
  const activeBetRef = useRef(activeBet);
  const balanceRef = useRef(balance);
  const pushOutcomeRef = useRef(pushOutcome);
  const updateBalanceRef = useRef(updateBalance);
  const onBalanceChangeRef = useRef(onBalanceChange);

  useEffect(() => {
    activeBetRef.current = activeBet;
  }, [activeBet]);
  useEffect(() => {
    balanceRef.current = balance;
  }, [balance]);
  useEffect(() => {
    pushOutcomeRef.current = pushOutcome;
  }, [pushOutcome]);
  useEffect(() => {
    updateBalanceRef.current = updateBalance;
  }, [updateBalance]);
  useEffect(() => {
    onBalanceChangeRef.current = onBalanceChange;
  }, [onBalanceChange]);

  useEffect(() => {
    let cancelled = false;
    const sync = async () => {
      const offset = await fetchServerTimeOffset();
      if (cancelled) return;
      serverOffsetRef.current = offset;
      setClockSynced(true);
      setSnap(getRouletteSnapshot(Date.now() + offset));
    };
    sync();
    const id = window.setInterval(sync, SERVER_SYNC_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  const settleIfNeeded = useCallback(async (s: RouletteSnapshot) => {
    if (s.phase !== 'result') return;
    const bet = activeBetRef.current;
    if (!bet || bet.roundIndex !== s.roundIndex) return;
    if (settledRoundRef.current === s.roundIndex) return;

    const settleKey = `roulette-settled-${user.id}-${s.roundIndex}`;
    try {
      if (sessionStorage.getItem(settleKey)) {
        settledRoundRef.current = s.roundIndex;
        return;
      }
      sessionStorage.setItem(settleKey, '1');
    } catch {
      /* ignore */
    }
    settledRoundRef.current = s.roundIndex;

    const { won, mult, payout } = evaluateBet(bet.target, s.result);
    const winAmount = won ? Math.floor(bet.amount * payout) : 0;
    const label =
      bet.target.type === 'color'
        ? COLOR_LABEL[bet.target.color]
        : `nº ${bet.target.number}`;

    if (won && winAmount > 0) {
      const newBal = bet.balanceAfterDebit + winAmount;
      const { error } = await updateBalanceRef.current(user.id, newBal);
      if (error) {
        setErrorMsg(error.message);
        return;
      }
      onBalanceChangeRef.current(newBal);
      setMessage(
        `Caiu ${s.result.number} (${COLOR_LABEL[s.result.color]}) · acertou ${label} · +${winAmount} Kz (${mult}x)`
      );
      pushOutcomeRef.current({
        kind: 'win',
        amount: winAmount,
        game: 'roulette',
        gameLabel: 'Roleta dos Crias',
        detail: `${s.result.number} ${COLOR_LABEL[s.result.color]} · ${mult}x`,
      });
    } else {
      setMessage(
        `Caiu ${s.result.number} (${COLOR_LABEL[s.result.color]}) · perdeu ${bet.amount} Kz`
      );
      pushOutcomeRef.current({
        kind: 'loss',
        amount: bet.amount,
        game: 'roulette',
        gameLabel: 'Roleta dos Crias',
        detail: `${s.result.number} ${COLOR_LABEL[s.result.color]}`,
      });
    }
  }, [user.id]);

  useEffect(() => {
    const tick = () => {
      const s = getRouletteSnapshot(Date.now() + serverOffsetRef.current);
      setSnap(s);

      // nova rodada: limpa UI de aposta antiga (mas mantém se ainda for a mesma)
      if (
        activeBetRef.current &&
        activeBetRef.current.roundIndex !== s.roundIndex &&
        s.phase === 'betting'
      ) {
        setActiveBet(null);
        setMessage(null);
        setErrorMsg(null);
      }

      void settleIfNeeded(s);
    };

    tick();
    const id = window.setInterval(tick, ROULETTE_TICK_MS);
    return () => window.clearInterval(id);
  }, [settleIfNeeded]);

  const placeBet = async () => {
    if (actionLoading) return;
    setErrorMsg(null);

    if (snap.phase !== 'betting') {
      setErrorMsg('Apostas só no cooldown. Espere a próxima rodada.');
      return;
    }
    if (activeBet?.roundIndex === snap.roundIndex) {
      setErrorMsg('Você já apostou nesta rodada.');
      return;
    }
    if (betAmount < 1) {
      setErrorMsg('Aposta mínima: 1 Kz.');
      return;
    }
    if (betAmount > balance) {
      setErrorMsg('Saldo insuficiente.');
      return;
    }

    setActionLoading(true);
    const stake = betAmount;
    const newBal = balance - stake;
    const { error } = await updateBalance(user.id, newBal);
    if (error) {
      setErrorMsg(error.message);
      setActionLoading(false);
      return;
    }

    onBalanceChange(newBal);
    settledRoundRef.current = null;
    setActiveBet({
      roundIndex: snap.roundIndex,
      amount: stake,
      target,
      balanceAfterDebit: newBal,
    });

    const pick =
      target.type === 'color' ? target.color : `n:${target.number}`;
    publish({
      kind: 'bet',
      game: 'roulette',
      roundIndex: snap.roundIndex,
      amount: stake,
      roulettePick: pick,
    });

    setMessage(null);
    setActionLoading(false);
  };

  const betsOn = (pick: string) =>
    markers.filter((m) => m.kind === 'bet' && m.roulettePick === pick);

  const selectColor = (color: RouletteColor) => {
    if (snap.phase !== 'betting' || activeBet?.roundIndex === snap.roundIndex) return;
    setTarget({ type: 'color', color });
  };

  const selectNumber = (num: number) => {
    if (snap.phase !== 'betting' || activeBet?.roundIndex === snap.roundIndex) return;
    setTarget({ type: 'number', number: num });
  };

  const hasBet = activeBet?.roundIndex === snap.roundIndex;
  const canBet =
    snap.phase === 'betting' && !hasBet && !actionLoading && betAmount >= 1 && betAmount <= balance;

  const targetLabel =
    target.type === 'color'
      ? `${COLOR_LABEL[target.color]} (${ROULETTE_MULT[target.color]}x)`
      : `Nº ${target.number} (${ROULETTE_MULT.number}x)`;

  const statusText =
    snap.phase === 'betting'
      ? `Apostas abertas · ${formatSeconds(snap.msRemaining)}s`
      : snap.phase === 'spinning'
        ? 'Bolinha rolando…'
        : `Resultado · próxima em ${formatSeconds(snap.msRemaining)}s`;

  return (
    <div className="aviator-page">
      <div className="aviator-top">
        <div className="flex items-center gap-2 min-w-0">
          {onBack && (
            <button type="button" onClick={onBack} className="btn btn-ghost btn-sm shrink-0">
              <ArrowLeft size={16} />
              Voltar
            </button>
          )}
          <div className="min-w-0">
            <h1 className="text-base sm:text-lg font-bold truncate">Roleta dos Crias</h1>
            <p className="text-[11px] sm:text-xs text-[var(--muted)] truncate">{statusText}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap justify-end">
          <span className="badge badge-info">#{snap.roundIndex}</span>
          <span className={`badge ${clockSynced ? 'badge-live' : 'badge-warn'}`}>
            {clockSynced ? 'Sync' : '...'}
          </span>
          <span className="badge badge-live">{balance} Kz</span>
        </div>
      </div>

      <div className="aviator-grid">
        <div className="aviator-main space-y-2.5">
          <section className="surface p-2.5 sm:p-3 glow-purple">
            <RouletteWheel
              phase={snap.phase}
              wheelDeg={snap.wheelDeg}
              ballDeg={snap.ballDeg}
              result={snap.result}
              spinProgress={snap.spinProgress}
            />

            <div className="phase-track phase-track-compact mt-2">
              <div
                className={`phase-step phase-step-bet ${snap.phase === 'betting' ? 'phase-step-active' : ''}`}
              >
                Apostas {ROULETTE_BET_MS / 1000}s
              </div>
              <div
                className={`phase-step phase-step-fly ${snap.phase === 'spinning' ? 'phase-step-active' : ''}`}
              >
                Giro
              </div>
              <div
                className={`phase-step phase-step-crash ${snap.phase === 'result' ? 'phase-step-active' : ''}`}
              >
                Resultado
              </div>
            </div>

            {snap.phase === 'result' && (
              <div className="mt-2 text-center">
                <span className="badge badge-info text-xs px-2.5 py-1">
                  🎱 <strong>{snap.result.number}</strong> · {COLOR_LABEL[snap.result.color]}
                </span>
              </div>
            )}

            {message && (
              <div
                className={`banner banner-tight mt-2 ${
                  message.includes('acertou') ? 'banner-success' : 'banner-danger'
                }`}
              >
                {message}
              </div>
            )}
            {errorMsg && (
              <div className="banner banner-tight banner-danger mt-2" role="alert">
                {errorMsg}
              </div>
            )}
          </section>

          <section className="surface p-2.5 sm:p-3 space-y-2.5">
            <div>
              <p className="section-label mb-2">Apostar na cor</p>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    ['red', 'Vermelho', ROULETTE_MULT.red],
                    ['black', 'Preto', ROULETTE_MULT.black],
                    ['white', 'Branco', ROULETTE_MULT.white],
                  ] as const
                ).map(([key, label, mult]) => {
                  const active = target.type === 'color' && target.color === key;
                  const on = betsOn(key);
                  return (
                    <div key={key} className="space-y-1">
                      <button
                        type="button"
                        disabled={snap.phase !== 'betting' || hasBet}
                        onClick={() => selectColor(key)}
                        className={`roulette-color-btn w-full ${key} ${active ? 'is-active' : ''}`}
                      >
                        <span className="font-bold text-sm">{label}</span>
                        <span className="text-xs opacity-80">{mult}x</span>
                      </button>
                      {on.length > 0 && (
                        <div className="flex flex-wrap gap-0.5 justify-center">
                          {on.map((m) => (
                            <span key={m.id} className={`live-pill ${key}`}>
                              {shortName(m.playerLabel)}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div>
              <p className="section-label mb-2">
                Ou um número ({ROULETTE_MULT.number}x)
              </p>
              <div className="flex flex-wrap gap-1.5">
                {WHEEL.map((s) => {
                  const active = target.type === 'number' && target.number === s.number;
                  const on = betsOn(`n:${s.number}`);
                  return (
                    <div key={s.number} className="relative">
                      <button
                        type="button"
                        disabled={snap.phase !== 'betting' || hasBet}
                        onClick={() => selectNumber(s.number)}
                        className={`roulette-chip ${s.color} ${active ? 'is-active' : ''}`}
                        title={on.map((m) => m.playerLabel).join(', ')}
                      >
                        {s.number}
                      </button>
                      {on.length > 0 && (
                        <span className="live-chip-count">{on.length}</span>
                      )}
                    </div>
                  );
                })}
              </div>
              {/* Lista compacta de quem apostou em número */}
              {markers.filter((m) => m.kind === 'bet' && m.roulettePick?.startsWith('n:')).length >
                0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {markers
                    .filter((m) => m.kind === 'bet' && m.roulettePick?.startsWith('n:'))
                    .map((m) => (
                      <span key={m.id} className="live-pill num">
                        {shortName(m.playerLabel)} → {m.roulettePick?.replace('n:', 'nº ')}
                      </span>
                    ))}
                </div>
              )}
            </div>

            {snap.phase === 'betting' && !hasBet && (
              <>
                <div className="bet-row">
                  <input
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
                    disabled={!canBet}
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
                      disabled={v > balance}
                      onClick={() => setBetAmount(v)}
                      className={`chip chip-sm ${betAmount === v ? 'chip-active' : ''}`}
                    >
                      {v}
                    </button>
                  ))}
                </div>
                <p className="field-hint text-center">
                  Seleção: <strong className="text-purple-200">{targetLabel}</strong>
                </p>
              </>
            )}

            {snap.phase === 'betting' && hasBet && activeBet && (
              <div className="banner banner-tight banner-warn text-center">
                Aposta de <strong>{activeBet.amount} Kz</strong> em{' '}
                <strong>
                  {activeBet.target.type === 'color'
                    ? COLOR_LABEL[activeBet.target.color]
                    : `nº ${activeBet.target.number}`}
                </strong>{' '}
                · giro em {formatSeconds(snap.msRemaining)}s
              </div>
            )}

            {snap.phase === 'spinning' && (
              <div className="banner banner-tight banner-info text-center">
                {hasBet
                  ? 'Sua aposta está na mesa — a bolinha decide…'
                  : 'Sem aposta nesta rodada. Espere o próximo cooldown.'}
              </div>
            )}

            {snap.phase === 'result' && !hasBet && !message && (
              <div className="banner banner-tight banner-info text-center">
                Próximas apostas em {formatSeconds(snap.msRemaining)}s
              </div>
            )}
          </section>

          <p className="text-center text-[11px] text-[var(--muted)] flex items-center justify-center gap-1">
            <AlertTriangle size={11} className="text-[var(--danger)]" />
            Roleta global · mesmo resultado pra todos · sátira
          </p>
        </div>

        <aside className="aviator-side">
          <div className="aviator-side-sticky space-y-3">
            <div className="surface p-3 text-xs text-[var(--text-secondary)] space-y-1.5 leading-relaxed">
              <p className="font-semibold text-[var(--text)] text-sm">Como joga</p>
              <p>1. Aposte no cooldown ({ROULETTE_BET_MS / 1000}s)</p>
              <p>2. Todos veem o mesmo giro da bolinha</p>
              <p>3. 🔴 {ROULETTE_MULT.red}x · ⬛ {ROULETTE_MULT.black}x · ⬜ {ROULETTE_MULT.white}x · nº {ROULETTE_MULT.number}x</p>
            </div>
            <RichLeaderboard currentUserId={user.id} limit={10} compact />
          </div>
        </aside>
      </div>
    </div>
  );
}
