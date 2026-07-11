'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowLeft, Loader2, Pickaxe } from 'lucide-react';
import { fetchServerTimeOffset, supabase } from '../lib/supabase';
import { SERVER_SYNC_MS } from '../lib/crash-engine';
import {
  MINES_BET_MS,
  MINES_BOMBS,
  MINES_CELLS,
  MINES_GRID,
  MINES_TICK_MS,
  formatSeconds,
  getMinesSnapshot,
  minesMultiplier,
  resolveMinesWinners,
  type MinesScoreEntry,
  type MinesSnapshot,
} from '../lib/mines-engine';
import { useGameToasts } from './GameToastProvider';
import { useLiveMarkers } from '../hooks/useLiveMarkers';
import { shortName } from '../lib/live-presence';
import { maskPlayerLabel } from '../lib/game-feed';
import RichLeaderboard from './RichLeaderboard';
import DodgingButton from './DodgingButton';

type ProfileUser = { id: string; email?: string | null };

type MinesGameProps = {
  user: ProfileUser;
  balance: number;
  onBalanceChange: (n: number) => void;
  onBack?: () => void;
  updateBalance: (userId: string, balance: number) => Promise<{ error: Error | null }>;
};

const BET_PRESETS = [5, 10, 20, 50];
const SCORE_EVENT = 'mines-score';
const SCORE_CHANNEL = 'mines-scores-v1';

export default function MinesGame({
  user,
  balance,
  onBalanceChange,
  onBack,
  updateBalance,
}: MinesGameProps) {
  const { pushOutcome } = useGameToasts();
  const [snap, setSnap] = useState<MinesSnapshot>(() => getMinesSnapshot());
  const [betAmount, setBetAmount] = useState(5);
  const [joined, setJoined] = useState(false);
  const [stake, setStake] = useState(0);
  const [balanceAfterDebit, setBalanceAfterDebit] = useState(0);
  const [revealed, setRevealed] = useState<boolean[]>(() => Array(MINES_CELLS).fill(false));
  const [blown, setBlown] = useState(false);
  const [cashed, setCashed] = useState(false);
  /** Diamantes travados no cash out (ou 0 se explodiu). */
  const [lockedDiamonds, setLockedDiamonds] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [clockSynced, setClockSynced] = useState(false);
  const [scores, setScores] = useState<MinesScoreEntry[]>([]);
  const [winnersText, setWinnersText] = useState<string | null>(null);

  const serverOffsetRef = useRef(0);
  const settledRef = useRef(false);
  const roundRef = useRef(snap.roundIndex);
  const scoreChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Só conta diamantes (células seguras reveladas), não bombas
  const gems = useMemo(() => {
    return revealed.reduce((n, isOpen, i) => {
      if (!isOpen) return n;
      if (snap.mines[i]) return n;
      return n + 1;
    }, 0);
  }, [revealed, snap.mines]);
  const mult = minesMultiplier(gems);

  const { markers, publish } = useLiveMarkers(
    'mines',
    snap.roundIndex,
    user.id,
    user.email
  );

  // Sync relógio
  useEffect(() => {
    let cancelled = false;
    const sync = async () => {
      const offset = await fetchServerTimeOffset();
      if (cancelled) return;
      serverOffsetRef.current = offset;
      setClockSynced(true);
      setSnap(getMinesSnapshot(Date.now() + offset));
    };
    sync();
    const id = window.setInterval(sync, SERVER_SYNC_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  // Canal de scores da rodada (pra coroa do maior score)
  useEffect(() => {
    const ch = supabase.channel(SCORE_CHANNEL, {
      config: { broadcast: { self: true } },
    });
    ch.on('broadcast', { event: SCORE_EVENT }, ({ payload }) => {
      const e = payload as MinesScoreEntry;
      if (!e?.playerId || e.roundIndex !== roundRef.current) return;
      setScores((prev) => {
        const rest = prev.filter((x) => x.playerId !== e.playerId);
        return [...rest, e];
      });
    });
    ch.subscribe();
    scoreChannelRef.current = ch;
    return () => {
      scoreChannelRef.current = null;
      void supabase.removeChannel(ch);
    };
  }, []);

  const publishScore = useCallback(
    (entry: MinesScoreEntry) => {
      setScores((prev) => {
        const rest = prev.filter((x) => x.playerId !== entry.playerId);
        return [...rest, entry];
      });
      const ch = scoreChannelRef.current;
      if (ch) void ch.send({ type: 'broadcast', event: SCORE_EVENT, payload: entry });
    },
    []
  );

  const resetRound = useCallback((roundIndex: number) => {
    roundRef.current = roundIndex;
    settledRef.current = false;
    setJoined(false);
    setStake(0);
    setBalanceAfterDebit(0);
    setRevealed(Array(MINES_CELLS).fill(false));
    setBlown(false);
    setCashed(false);
    setLockedDiamonds(0);
    setMessage(null);
    setErrorMsg(null);
    setScores([]);
    setWinnersText(null);
  }, []);

  useEffect(() => {
    const tick = () => {
      const s = getMinesSnapshot(Date.now() + serverOffsetRef.current);
      setSnap(s);

      if (s.roundIndex !== roundRef.current) {
        resetRound(s.roundIndex);
      }

      // Resolve vencedores no resultado (mais diamantes sem explodir)
      if (s.phase === 'result' && !settledRef.current) {
        settledRef.current = true;
        setScores((current) => {
          const { winners, pot, prizeEach, maxDiamonds } = resolveMinesWinners(current);
          if (winners.length === 0) {
            setWinnersText(
              pot > 0
                ? `Ninguém sobreviveu com diamantes. Pot de ${pot} Kz pro void ⛏`
                : 'Sem apostas nesta rodada.'
            );
            return current;
          }
          const names = winners.map((w) => shortName(w.playerLabel)).join(', ');
          const d = maxDiamonds ?? 0;
          setWinnersText(
            winners.length === 1
              ? `👑 ${names} venceu sozinho com ${d} 💎 · levou ${prizeEach} Kz (pot ${pot} Kz)`
              : `👑 Empate: ${names} · ${d} 💎 · ${prizeEach} Kz cada (pot ${pot} Kz)`
          );
          return current;
        });
      }
    };

    tick();
    const id = window.setInterval(tick, MINES_TICK_MS);
    return () => window.clearInterval(id);
  }, [resetRound]);

  // Winner payout: when result phase and I'm winner, credit pot share once
  useEffect(() => {
    if (snap.phase !== 'result') return;
    const key = `mines-prize-${user.id}-${snap.roundIndex}`;
    try {
      if (sessionStorage.getItem(key)) return;
    } catch {
      /* */
    }

    const { winners, prizeEach } = resolveMinesWinners(scores);
    const me = winners.find((w) => w.playerId === user.id);
    if (!me || prizeEach < 1) return;

    try {
      sessionStorage.setItem(key, '1');
    } catch {
      /* */
    }

    void (async () => {
      const newBal = balance + prizeEach;
      const { error } = await updateBalance(user.id, newBal);
      if (!error) {
        onBalanceChange(newBal);
        pushOutcome({
          kind: 'win',
          amount: prizeEach,
          game: 'mines',
          gameLabel: 'Mines do Minecraft',
          detail: `mais diamantes: ${me.diamonds} 💎`,
        });
      }
    })();
  }, [snap.phase, snap.roundIndex, scores, user.id, balance, updateBalance, onBalanceChange, pushOutcome]);

  const joinRound = async () => {
    if (loading || snap.phase !== 'betting' || joined) return;
    setErrorMsg(null);
    if (betAmount < 1) return setErrorMsg('Mínimo 1 Kz');
    if (betAmount > balance) return setErrorMsg('Saldo insuficiente');

    setLoading(true);
    const newBal = balance - betAmount;
    const { error } = await updateBalance(user.id, newBal);
    if (error) {
      setErrorMsg(error.message);
      setLoading(false);
      return;
    }
    onBalanceChange(newBal);
    setJoined(true);
    setStake(betAmount);
    setBalanceAfterDebit(newBal);
    setLoading(false);

    publishScore({
      playerId: user.id,
      playerLabel: maskPlayerLabel(user.email),
      roundIndex: snap.roundIndex,
      diamonds: 0,
      stake: betAmount,
      status: 'playing',
    });
  };

  const countGems = (rev: boolean[], mines: boolean[]) =>
    rev.reduce((n, isOpen, i) => (isOpen && !mines[i] ? n + 1 : n), 0);

  const reveal = (idx: number) => {
    if (snap.phase !== 'playing' || !joined || blown || cashed) return;
    if (revealed[idx]) return;

    if (snap.mines[idx]) {
      const next = [...revealed];
      next[idx] = true;
      for (let i = 0; i < MINES_CELLS; i++) if (snap.mines[i]) next[i] = true;
      setRevealed(next);
      setBlown(true);
      setLockedDiamonds(0);
      setMessage(`💥 Creeper! Você perdeu ${stake} Kz · fora da disputa`);
      publishScore({
        playerId: user.id,
        playerLabel: maskPlayerLabel(user.email),
        roundIndex: snap.roundIndex,
        diamonds: 0,
        stake,
        status: 'bombed',
      });
      publish({
        kind: 'crash',
        game: 'mines',
        roundIndex: snap.roundIndex,
        amount: stake,
        score: 0,
      });
      pushOutcome({
        kind: 'loss',
        amount: stake,
        game: 'mines',
        gameLabel: 'Mines do Minecraft',
        detail: 'creeper',
      });
      return;
    }

    const next = [...revealed];
    next[idx] = true;
    setRevealed(next);
    const d = countGems(next, snap.mines);
    publishScore({
      playerId: user.id,
      playerLabel: maskPlayerLabel(user.email),
      roundIndex: snap.roundIndex,
      diamonds: d,
      stake,
      status: 'playing',
    });
  };

  const cashOut = () => {
    if (!joined || blown || cashed || snap.phase !== 'playing') return;
    if (gems < 1) {
      setErrorMsg('Pegue ao menos 1 diamante antes de travar.');
      return;
    }
    setCashed(true);
    setLockedDiamonds(gems);
    setMessage(
      `⛏ Travou com ${gems} 💎 · ganha quem tiver mais diamantes sem explodir`
    );
    publishScore({
      playerId: user.id,
      playerLabel: maskPlayerLabel(user.email),
      roundIndex: snap.roundIndex,
      diamonds: gems,
      stake,
      status: 'cashed',
    });
    publish({
      kind: 'cashout',
      game: 'mines',
      roundIndex: snap.roundIndex,
      amount: stake,
      score: gems,
    });
  };

  // Fim do tempo: se ainda está vivo, trava diamantes atuais (não zera)
  useEffect(() => {
    if (snap.phase !== 'result') return;
    if (!joined || cashed || blown) return;
    const d = gems;
    setCashed(true);
    setLockedDiamonds(d);
    publishScore({
      playerId: user.id,
      playerLabel: maskPlayerLabel(user.email),
      roundIndex: snap.roundIndex,
      diamonds: d,
      stake,
      status: d > 0 ? 'cashed' : 'bombed',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snap.phase]);

  const statusText =
    snap.phase === 'betting'
      ? `Apostas · ${formatSeconds(snap.msRemaining)}s`
      : snap.phase === 'playing'
        ? `Minerando · ${formatSeconds(snap.msRemaining)}s`
        : `Resultado · ${formatSeconds(snap.msRemaining)}s`;

  const liveScores = useMemo(() => {
    return [...scores].sort((a, b) => {
      if (b.diamonds !== a.diamonds) return b.diamonds - a.diamonds;
      return b.stake - a.stake;
    });
  }, [scores]);

  const potTotal = liveScores.reduce((s, e) => s + e.stake, 0) || stake || 0;
  const phaseLabel =
    snap.phase === 'betting' ? 'Apostas' : snap.phase === 'playing' ? 'Minerando' : 'Resultado';

  return (
    <div className="mines-page">
      <header className="mines-header">
        <div className="mines-header-left">
          {onBack && (
            <button type="button" onClick={onBack} className="mines-back">
              <ArrowLeft size={18} />
              <span>Voltar</span>
            </button>
          )}
          <div>
            <h1 className="mines-title">
              <Pickaxe size={22} />
              Mines do Minecraft
            </h1>
            <p className="mines-subtitle">{statusText}</p>
          </div>
        </div>
        <div className="mines-header-badges">
          <span className="mines-badge">#{snap.roundIndex}</span>
          <span className={`mines-badge ${clockSynced ? 'ok' : 'wait'}`}>
            {clockSynced ? 'Sync' : '...'}
          </span>
          <span className="mines-badge gold">{balance} Kz</span>
        </div>
      </header>

      {/* Fases em cards, não em uma linha espremida */}
      <div className="mines-phases">
        <div className={`mines-phase ${snap.phase === 'betting' ? 'active bet' : ''}`}>
          <span className="mines-phase-num">1</span>
          <div>
            <strong>Apostas</strong>
            <p>{MINES_BET_MS / 1000}s</p>
          </div>
        </div>
        <div className={`mines-phase ${snap.phase === 'playing' ? 'active play' : ''}`}>
          <span className="mines-phase-num">2</span>
          <div>
            <strong>Minerar</strong>
            <p>quebra blocos</p>
          </div>
        </div>
        <div className={`mines-phase ${snap.phase === 'result' ? 'active res' : ''}`}>
          <span className="mines-phase-num">3</span>
          <div>
            <strong>Vencedor</strong>
            <p>mais 💎</p>
          </div>
        </div>
      </div>

      <div className="mines-layout">
        <div className="mines-main">
          <section className="mines-panel">
            <div className="mines-panel-top">
              <div className="mines-panel-title">
                <span className="mines-pixel-icon">⛏</span>
                <div>
                  <h2>Campo de mineração</h2>
                  <p>
                    {MINES_BOMBS} creepers escondidos · grade {MINES_GRID}×{MINES_GRID}
                  </p>
                </div>
              </div>
              <div className="mines-phase-pill">{phaseLabel}</div>
            </div>

            <div className="mines-rule-box">
              <strong>Regra do pot</strong>
              <p>
                Quem pegar <em>mais diamantes sem explodir</em> leva o pot. Empate divide.
                Creeper = 0 💎 e fora da disputa.
              </p>
            </div>

            <div className="mines-board-wrap">
              <div
                className="mines-grid"
                style={{ gridTemplateColumns: `repeat(${MINES_GRID}, 1fr)` }}
              >
                {Array.from({ length: MINES_CELLS }, (_, i) => {
                  const isRev = revealed[i];
                  const isMine = snap.mines[i];
                  const showMine =
                    isRev && (isMine || snap.phase === 'result' || blown);
                  const showGem = isRev && !isMine;
                  const locked =
                    snap.phase !== 'playing' || !joined || blown || cashed;

                  return (
                    <button
                      key={i}
                      type="button"
                      disabled={locked || isRev}
                      onClick={() => reveal(i)}
                      className={`mines-cell ${isRev ? 'is-open' : 'is-closed'} ${
                        showMine ? 'is-mine' : ''
                      } ${showGem ? 'is-gem' : ''}`}
                      aria-label={
                        showMine ? 'Creeper' : showGem ? 'Diamante' : 'Bloco de grama'
                      }
                    >
                      {!isRev && (
                        <>
                          <span className="mc-grass-top" aria-hidden />
                          <span className="mc-grass-side" aria-hidden />
                        </>
                      )}
                      <span className="mines-cell-face">
                        {showMine ? '💣' : showGem ? '💎' : ''}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mines-stats">
              <div className="mines-stat">
                <span className="mines-stat-icon">💎</span>
                <div>
                  <p>Diamantes</p>
                  <strong>{cashed || blown ? lockedDiamonds : gems}</strong>
                </div>
              </div>
              <div className="mines-stat">
                <span className="mines-stat-icon">⚡</span>
                <div>
                  <p>Risco (ref.)</p>
                  <strong className="gold">{mult.toFixed(2)}x</strong>
                </div>
              </div>
              <div className="mines-stat">
                <span className="mines-stat-icon">👑</span>
                <div>
                  <p>Pot</p>
                  <strong className="purple">{potTotal} Kz</strong>
                </div>
              </div>
            </div>

            {message && (
              <div
                className={`mines-alert ${
                  message.includes('Cash') ? 'warn' : 'danger'
                }`}
              >
                {message}
              </div>
            )}
            {winnersText && <div className="mines-alert ok">{winnersText}</div>}
            {errorMsg && <div className="mines-alert danger">{errorMsg}</div>}
          </section>

          <section className="mines-controls">
            {snap.phase === 'betting' && !joined && (
              <>
                <p className="mines-controls-label">Valor no pot</p>
                <div className="mines-bet-row">
                  <input
                    type="number"
                    min={1}
                    max={balance}
                    value={betAmount}
                    onChange={(e) => setBetAmount(Math.max(0, Number(e.target.value)))}
                    className="mines-bet-input"
                  />
                  <button
                    type="button"
                    onClick={joinRound}
                    disabled={loading || betAmount < 1 || betAmount > balance}
                    className="mines-btn-primary"
                  >
                    {loading ? <Loader2 className="animate-spin" size={20} /> : 'Entrar no pot'}
                  </button>
                </div>
                <div className="mines-presets">
                  {BET_PRESETS.map((v) => (
                    <button
                      key={v}
                      type="button"
                      disabled={v > balance}
                      onClick={() => setBetAmount(v)}
                      className={`mines-preset ${betAmount === v ? 'on' : ''}`}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </>
            )}

            {joined && snap.phase === 'betting' && (
              <div className="mines-alert warn">
                Você entrou com <strong>{stake} Kz</strong>
                <br />
                Mineração em {formatSeconds(snap.msRemaining)}s
              </div>
            )}

            {joined && snap.phase === 'playing' && !blown && !cashed && (
              <DodgingButton
                active
                dodgeChance={0.075}
                onClick={cashOut}
                className="mines-btn-cashout"
              >
                Travar {gems} 💎 e esperar o fim
              </DodgingButton>
            )}

            {cashed && !blown && (
              <div className="mines-alert info">
                Travou com <strong>{lockedDiamonds} 💎</strong>
                <br />
                Ganha quem tiver mais diamantes sem explodir 👑
              </div>
            )}

            {!joined && snap.phase !== 'betting' && (
              <div className="mines-alert info">Você não entrou nesta rodada.</div>
            )}
          </section>

          <section className="mines-scoreboard">
            <div className="mines-scoreboard-head">
              <h3>Placar da rodada</h3>
              <span>{liveScores.length} no pot</span>
            </div>
            {liveScores.length === 0 ? (
              <p className="mines-empty">Ninguém no pot ainda…</p>
            ) : (
              <ul className="mines-score-list">
                {liveScores.map((e, i) => (
                  <li
                    key={e.playerId}
                    className={`mines-score-row ${e.playerId === user.id ? 'is-me' : ''}`}
                  >
                    <span className="mines-rank">#{i + 1}</span>
                    <span className="mines-player truncate">{shortName(e.playerLabel)}</span>
                    <span className="mines-score-val">
                      {e.status === 'bombed'
                        ? '💥 0 💎'
                        : e.status === 'cashed'
                          ? `⛏ ${e.diamonds} 💎`
                          : `… ${e.diamonds} 💎`}
                    </span>
                    <span className="mines-stake">{e.stake} Kz</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <p className="mines-footer">
            <AlertTriangle size={12} />
            Sátira Minecraft · mais diamantes (sem explodir) leva o pot
          </p>
        </div>

        <aside className="mines-side">
          <div className="mines-howto">
            <h3>Como joga</h3>
            <ol>
              <li>
                <span>1</span> Entra no pot no cooldown
              </li>
              <li>
                <span>2</span> Quebra grama e pega 💎
              </li>
              <li>
                <span>3</span> 💣 creeper = 0 diamantes
              </li>
              <li>
                <span>4</span> Trava seus diamantes (ou espera o fim)
              </li>
              <li>
                <span>5</span> <strong>Mais 💎 sem explodir</strong> leva o pot
              </li>
            </ol>
          </div>
          <RichLeaderboard currentUserId={user.id} limit={8} compact />
        </aside>
      </div>
    </div>
  );
}
