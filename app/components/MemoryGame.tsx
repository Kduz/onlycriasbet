'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, ArrowLeft, Loader2, Sparkles } from 'lucide-react';
import { payAffiliateCommission } from '../lib/affiliate';
import { creditHouseBank } from '../lib/house-bank';
import {
  MEMORY_CARD_BACK,
  MEMORY_MAX_MISSES,
  MEMORY_PAIR_COUNT,
  MEMORY_WIN_MULT,
  createMemoryDeck,
  memoryWinPayout,
  symbolSrc,
  type MemoryCard,
  type MemoryPhase,
} from '../lib/memory-engine';
import { useGameToasts } from './GameToastProvider';
import { FantasyBanner, FantasyFrame, GemIcon } from './FantasyDecor';
import RichLeaderboard from './RichLeaderboard';

type ProfileUser = { id: string; email?: string | null };

type MemoryGameProps = {
  user: ProfileUser;
  balance: number;
  onBalanceChange: (n: number) => void;
  onBack?: () => void;
  updateBalance: (userId: string, balance: number) => Promise<{ error: Error | null }>;
};

const BET_PRESETS = [5, 10, 20, 50];

export default function MemoryGame({
  user,
  balance,
  onBalanceChange,
  onBack,
  updateBalance,
}: MemoryGameProps) {
  const { pushOutcome } = useGameToasts();
  const [phase, setPhase] = useState<MemoryPhase>('betting');
  const [betAmount, setBetAmount] = useState(10);
  const [stake, setStake] = useState(0);
  const [deck, setDeck] = useState<MemoryCard[]>([]);
  const [flipped, setFlipped] = useState<number[]>([]);
  const [matched, setMatched] = useState<Set<number>>(() => new Set());
  const [misses, setMisses] = useState(0);
  const [pairsFound, setPairsFound] = useState(0);
  const [lockBoard, setLockBoard] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const settleRef = useRef(false);
  const balAfterBetRef = useRef(0);

  const livesLeft = MEMORY_MAX_MISSES - misses;

  const startGame = async () => {
    if (loading || phase !== 'betting') return;
    setErrorMsg(null);
    setMessage(null);
    if (betAmount < 1) return setErrorMsg('Minimo 1 Kz');
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
    balAfterBetRef.current = newBal;
    setStake(betAmount);
    setDeck(createMemoryDeck(MEMORY_PAIR_COUNT));
    setFlipped([]);
    setMatched(new Set());
    setMisses(0);
    setPairsFound(0);
    setLockBoard(false);
    settleRef.current = false;
    setPhase('playing');
    setLoading(false);
  };

  const finishWin = useCallback(
    async (currentStake: number, bal: number) => {
      if (settleRef.current) return;
      settleRef.current = true;
      setPhase('won');
      const payout = memoryWinPayout(currentStake);
      const profit = payout - currentStake;
      const newBal = bal + payout;
      const { error } = await updateBalance(user.id, newBal);
      if (error) {
        setErrorMsg(error.message);
        setMessage('Venceu, mas falhou ao creditar.');
        return;
      }
      onBalanceChange(newBal);
      pushOutcome({
        kind: 'win',
        amount: profit,
        game: 'memory',
        gameLabel: 'Memoria dos Crias',
        detail: `${MEMORY_PAIR_COUNT} pares · ${MEMORY_WIN_MULT}x`,
      });
      const commission = await payAffiliateCommission(user.id, profit);
      const aff = commission > 0 ? ` · afiliado +${commission} Kz` : '';
      setMessage(`Todos os pares! +${profit} Kz (${payout} Kz total)${aff}`);
    },
    [user.id, updateBalance, onBalanceChange, pushOutcome]
  );

  const finishLoss = useCallback(
    async (currentStake: number) => {
      if (settleRef.current) return;
      settleRef.current = true;
      setPhase('lost');
      setMessage(`Sem vidas · perdeu ${currentStake} Kz`);
      void creditHouseBank(currentStake, 'memory', 'sem vidas');
    },
    []
  );

  const onCardClick = (index: number) => {
    if (phase !== 'playing' || lockBoard) return;
    if (flipped.includes(index)) return;
    if (matched.has(deck[index].pairKey)) return;
    if (flipped.length >= 2) return;

    const next = [...flipped, index];
    setFlipped(next);

    if (next.length < 2) return;

    setLockBoard(true);
    const [a, b] = next;
    const cardA = deck[a];
    const cardB = deck[b];

    if (cardA.pairKey === cardB.pairKey) {
      // Match
      window.setTimeout(() => {
        setMatched((prev) => {
          const n = new Set(prev);
          n.add(cardA.pairKey);
          return n;
        });
        setPairsFound((p) => {
          const np = p + 1;
          if (np >= MEMORY_PAIR_COUNT) {
            void finishWin(stake, balAfterBetRef.current);
          }
          return np;
        });
        setFlipped([]);
        setLockBoard(false);
      }, 380);
    } else {
      // Miss
      window.setTimeout(() => {
        setMisses((m) => {
          const nm = m + 1;
          if (nm >= MEMORY_MAX_MISSES) {
            void finishLoss(stake);
          }
          return nm;
        });
        setFlipped([]);
        setLockBoard(false);
      }, 700);
    }
  };

  // Safety: if balance prop lags after debit, win uses current balance prop
  useEffect(() => {
    if (phase === 'won' || phase === 'lost') return;
  }, [phase]);

  const newRound = () => {
    setPhase('betting');
    setDeck([]);
    setFlipped([]);
    setMatched(new Set());
    setMisses(0);
    setPairsFound(0);
    setStake(0);
    setMessage(null);
    setErrorMsg(null);
    setLockBoard(false);
    settleRef.current = false;
  };

  const isFaceUp = (i: number) =>
    flipped.includes(i) || matched.has(deck[i]?.pairKey);

  return (
    <div className="mem-page">
      <header className="mem-top">
        <div className="mem-top-left">
          {onBack && (
            <button type="button" onClick={onBack} className="mem-back">
              <ArrowLeft size={18} />
              <span>Voltar</span>
            </button>
          )}
          <div>
            <h1 className="mem-title">Memoria dos Crias</h1>
            <p className="mem-sub">Ache os pares · {MEMORY_WIN_MULT}x se completar</p>
          </div>
        </div>
        <div className="mem-badges">
          <span className="mem-badge solo">Solo</span>
          <span className="mem-badge gold">
            <GemIcon kind="blue" size={16} /> {balance} Kz
          </span>
        </div>
      </header>

      <div className="mem-layout">
        <div className="mem-main">
          {phase === 'betting' && (
            <FantasyBanner title="Memoria" subtitle="Vire as cartas e ache os pares" />
          )}

          {phase === 'playing' && (
            <div className="mem-hud">
              <div className="mem-hud-item">
                <span>Pares</span>
                <strong>
                  {pairsFound}/{MEMORY_PAIR_COUNT}
                </strong>
              </div>
              <div className="mem-hud-item">
                <span>Vidas</span>
                <strong className={livesLeft <= 2 ? 'danger' : ''}>{livesLeft}</strong>
              </div>
              <div className="mem-hud-item">
                <span>Aposta</span>
                <strong>{stake} Kz</strong>
              </div>
            </div>
          )}

          {(phase === 'playing' || phase === 'won' || phase === 'lost') && deck.length > 0 && (
            <FantasyFrame className="mem-board-frame">
              <div className="mem-grid" role="grid" aria-label="Tabuleiro de memoria">
                {deck.map((card, i) => {
                  const up = isFaceUp(i);
                  const isMatch = matched.has(card.pairKey);
                  return (
                    <button
                      key={card.id}
                      type="button"
                      className={`mem-card ${up ? 'is-up' : 'is-down'} ${
                        isMatch ? 'is-match' : ''
                      }`}
                      onClick={() => onCardClick(i)}
                      disabled={
                        phase !== 'playing' ||
                        lockBoard ||
                        up ||
                        isMatch
                      }
                      aria-label={up ? card.symbol : 'Carta virada'}
                    >
                      <span className="mem-card-inner">
                        <span className="mem-card-face mem-card-back">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={MEMORY_CARD_BACK} alt="" draggable={false} />
                        </span>
                        <span className="mem-card-face mem-card-front">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={symbolSrc(card.symbol)}
                            alt={card.symbol}
                            draggable={false}
                          />
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </FantasyFrame>
          )}

          {phase === 'won' && (
            <div className="mem-result win">
              <Sparkles size={18} />
              Vitoria · {MEMORY_WIN_MULT}x
            </div>
          )}
          {phase === 'lost' && (
            <div className="mem-result lose">Sem vidas · banca levou</div>
          )}

          {message && (
            <div className={`mem-alert ${phase === 'won' ? 'ok' : phase === 'lost' ? 'bad' : 'info'}`}>
              {message}
            </div>
          )}
          {errorMsg && <div className="mem-alert bad">{errorMsg}</div>}

          <FantasyFrame compact className="mem-controls">
            {phase === 'betting' && (
              <>
                <p className="mem-ctrl-label">Valor da aposta</p>
                <div className="mem-bet-row">
                  <input
                    type="number"
                    min={1}
                    max={balance}
                    value={betAmount}
                    onChange={(e) => setBetAmount(Math.max(0, Number(e.target.value)))}
                    className="mem-bet-input"
                    aria-label="Aposta"
                  />
                  <button
                    type="button"
                    onClick={startGame}
                    disabled={loading || betAmount < 1 || betAmount > balance}
                    className="btn btn-purple mem-deal"
                  >
                    {loading ? (
                      <Loader2 className="animate-spin" size={18} />
                    ) : (
                      'Comecar'
                    )}
                  </button>
                </div>
                <div className="mem-presets">
                  {BET_PRESETS.map((v) => (
                    <button
                      key={v}
                      type="button"
                      disabled={v > balance}
                      onClick={() => setBetAmount(v)}
                      className={`chip ${betAmount === v ? 'chip-active' : ''}`}
                    >
                      {v}
                    </button>
                  ))}
                </div>
                <p className="mem-hint">
                  {MEMORY_PAIR_COUNT} pares · {MEMORY_MAX_MISSES} erros max · ganha {MEMORY_WIN_MULT}x
                </p>
              </>
            )}

            {(phase === 'won' || phase === 'lost') && (
              <button type="button" onClick={newRound} className="btn btn-purple w-full">
                Nova partida
              </button>
            )}

            {phase === 'playing' && (
              <p className="mem-hint center">
                Toque em 2 cartas · errou gasta 1 vida
              </p>
            )}
          </FantasyFrame>

          <p className="mem-footer">
            <AlertTriangle size={12} />
            Satira · memoria com imagens fantasy
          </p>
        </div>

        <aside className="mem-side">
          <FantasyFrame compact>
            <h3 className="mem-howto-title">Como joga</h3>
            <ol className="mem-howto">
              <li>
                <span>1</span> Aposta e embaralha as cartas
              </li>
              <li>
                <span>2</span> Vira 2 cartas por vez
              </li>
              <li>
                <span>3</span> Par igual fica aberto
              </li>
              <li>
                <span>4</span> Errou = perde 1 vida
              </li>
              <li>
                <span>5</span> Complete todos = {MEMORY_WIN_MULT}x a aposta
              </li>
            </ol>
          </FantasyFrame>
          <RichLeaderboard currentUserId={user.id} limit={8} compact />
        </aside>
      </div>
    </div>
  );
}
