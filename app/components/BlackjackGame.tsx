'use client';

import { useCallback, useMemo, useState } from 'react';
import { AlertTriangle, ArrowLeft, Loader2, Sparkles } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { payAffiliateCommission } from '../lib/affiliate';
import { creditHouseBank } from '../lib/house-bank';
import {
  createShoe,
  drawCard,
  dealerShouldHit,
  formatHandTotal,
  handValue,
  isBlackjack,
  isBust,
  isRedSuit,
  payoutForResult,
  resolveHands,
  resultLabel,
  SUIT_SYMBOL,
  type BjPhase,
  type Card,
  type HandResult,
} from '../lib/blackjack';
import { useGameToasts } from './GameToastProvider';
import RichLeaderboard from './RichLeaderboard';
import DodgingButton from './DodgingButton';

type ProfileUser = { id: string; email?: string | null };

type BlackjackGameProps = {
  user: ProfileUser;
  balance: number;
  onBalanceChange: (n: number) => void;
  onBack?: () => void;
  updateBalance: (userId: string, balance: number) => Promise<{ error: Error | null }>;
};

const BET_PRESETS = [5, 10, 20, 50, 100];

function PlayingCard({
  card,
  faceDown = false,
  delay = 0,
  compact = false,
}: {
  card?: Card;
  faceDown?: boolean;
  delay?: number;
  compact?: boolean;
}) {
  if (faceDown || !card) {
    return (
      <motion.div
        className={`bj-card bj-card-back ${compact ? 'bj-card-sm' : ''}`}
        initial={{ y: -28, opacity: 0, rotateY: -40 }}
        animate={{ y: 0, opacity: 1, rotateY: 0 }}
        transition={{ type: 'spring', stiffness: 320, damping: 22, delay }}
        aria-label="Carta virada"
      >
        <div className="bj-card-back-pattern" />
        <span className="bj-card-back-logo">21</span>
      </motion.div>
    );
  }

  const red = isRedSuit(card.suit);
  return (
    <motion.div
      className={`bj-card ${red ? 'bj-card-red' : 'bj-card-black'} ${compact ? 'bj-card-sm' : ''}`}
      initial={{ y: -36, opacity: 0, rotate: -8, scale: 0.9 }}
      animate={{ y: 0, opacity: 1, rotate: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 340, damping: 20, delay }}
      aria-label={`${card.rank} de ${card.suit}`}
    >
      <div className="bj-card-corner top">
        <span className="bj-rank">{card.rank}</span>
        <span className="bj-suit">{SUIT_SYMBOL[card.suit]}</span>
      </div>
      <div className="bj-card-center">{SUIT_SYMBOL[card.suit]}</div>
      <div className="bj-card-corner bottom">
        <span className="bj-rank">{card.rank}</span>
        <span className="bj-suit">{SUIT_SYMBOL[card.suit]}</span>
      </div>
    </motion.div>
  );
}

export default function BlackjackGame({
  user,
  balance,
  onBalanceChange,
  onBack,
  updateBalance,
}: BlackjackGameProps) {
  const { pushOutcome } = useGameToasts();
  const [phase, setPhase] = useState<BjPhase>('betting');
  const [betAmount, setBetAmount] = useState(10);
  const [stake, setStake] = useState(0);
  const [shoe, setShoe] = useState<Card[]>(() => createShoe(4));
  const [player, setPlayer] = useState<Card[]>([]);
  const [dealer, setDealer] = useState<Card[]>([]);
  const [result, setResult] = useState<HandResult | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [doubled, setDoubled] = useState(false);
  const [handId, setHandId] = useState(0);

  const playerTotal = useMemo(() => handValue(player), [player]);
  const dealerTotal = useMemo(() => handValue(dealer), [dealer]);
  const hideHole = phase === 'playing';
  const canDouble =
    phase === 'playing' &&
    player.length === 2 &&
    !doubled &&
    balance >= stake &&
    stake > 0;

  const finishHand = useCallback(
    async (
      pHand: Card[],
      dHand: Card[],
      currentStake: number,
      bal: number
    ) => {
      const res = resolveHands(pHand, dHand);
      const payout = payoutForResult(res, currentStake);
      setResult(res);
      setPhase('result');

      const profit = payout - currentStake;
      const label = resultLabel(res);

      if (payout > 0) {
        const newBal = bal + payout;
        const { error } = await updateBalance(user.id, newBal);
        if (!error) {
          onBalanceChange(newBal);
          if (profit > 0) {
            pushOutcome({
              kind: 'win',
              amount: profit,
              game: 'blackjack',
              gameLabel: '21 dos Crias',
              detail:
                res === 'player_blackjack'
                  ? 'blackjack 3:2'
                  : res === 'dealer_bust'
                    ? 'banca estourou'
                    : `${handValue(pHand).total} vs ${handValue(dHand).total}`,
            });
            const commission = await payAffiliateCommission(user.id, profit);
            const aff = commission > 0 ? ` · afiliado +${commission} Kz` : '';
            setMessage(`${label} · +${profit} Kz (total ${payout} Kz)${aff}`);
          } else {
            // push — devolveu a aposta
            setMessage(`${label} · ${currentStake} Kz de volta`);
          }
        } else {
          setErrorMsg(error.message);
          setMessage(label);
        }
      } else {
        // Solo: perdas ficam na tela local + vão para a conta da banca
        setMessage(`${label} · −${currentStake} Kz`);
        void creditHouseBank(
          currentStake,
          'blackjack',
          `${label} · ${handValue(pHand).total} vs ${handValue(dHand).total}`
        );
      }
      setLoading(false);
    },
    [user.id, updateBalance, onBalanceChange, pushOutcome]
  );

  const runDealer = useCallback(
    async (pHand: Card[], dStart: Card[], currentShoe: Card[], currentStake: number, bal: number) => {
      setPhase('dealer');
      let dHand = [...dStart];
      let s = currentShoe;

      // Pequenos delays visuais entre cartas da banca
      const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

      while (dealerShouldHit(dHand)) {
        await sleep(480);
        const drawn = drawCard(s);
        s = drawn.shoe;
        dHand = [...dHand, drawn.card];
        setDealer([...dHand]);
        setShoe(s);
      }

      await sleep(320);
      await finishHand(pHand, dHand, currentStake, bal);
    },
    [finishHand]
  );

  const deal = async () => {
    if (loading || phase !== 'betting') return;
    setErrorMsg(null);
    setMessage(null);
    setResult(null);

    if (betAmount < 1) return setErrorMsg('Aposta mínima: 1 Kz');
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

    let s = shoe.length < 20 ? createShoe(4) : shoe;
    const p1 = drawCard(s);
    s = p1.shoe;
    const d1 = drawCard(s);
    s = d1.shoe;
    const p2 = drawCard(s);
    s = p2.shoe;
    const d2 = drawCard(s);
    s = d2.shoe;

    const pHand = [p1.card, p2.card];
    const dHand = [d1.card, d2.card];

    setShoe(s);
    setPlayer(pHand);
    setDealer(dHand);
    setStake(betAmount);
    setDoubled(false);
    setHandId((h) => h + 1);
    setLoading(false);

    // Naturais
    if (isBlackjack(pHand) || isBlackjack(dHand)) {
      setPhase('dealer');
      window.setTimeout(() => {
        void finishHand(pHand, dHand, betAmount, newBal);
      }, 700);
      return;
    }

    setPhase('playing');
  };

  const hit = () => {
    if (phase !== 'playing' || loading) return;
    const drawn = drawCard(shoe);
    const pHand = [...player, drawn.card];
    setShoe(drawn.shoe);
    setPlayer(pHand);

    if (isBust(pHand)) {
      setLoading(true);
      void finishHand(pHand, dealer, stake, balance);
    }
  };

  const stand = () => {
    if (phase !== 'playing' || loading) return;
    setLoading(true);
    void runDealer(player, dealer, shoe, stake, balance);
  };

  const doubleDown = async () => {
    if (!canDouble || loading) return;
    setErrorMsg(null);
    setLoading(true);

    const extra = stake;
    if (extra > balance) {
      setErrorMsg('Saldo insuficiente para dobrar');
      setLoading(false);
      return;
    }

    const newBal = balance - extra;
    const { error } = await updateBalance(user.id, newBal);
    if (error) {
      setErrorMsg(error.message);
      setLoading(false);
      return;
    }
    onBalanceChange(newBal);

    const drawn = drawCard(shoe);
    const pHand = [...player, drawn.card];
    const newStake = stake * 2;
    setShoe(drawn.shoe);
    setPlayer(pHand);
    setStake(newStake);
    setDoubled(true);

    if (isBust(pHand)) {
      await finishHand(pHand, dealer, newStake, newBal);
      return;
    }

    await runDealer(pHand, dealer, drawn.shoe, newStake, newBal);
  };

  const newRound = () => {
    setPhase('betting');
    setPlayer([]);
    setDealer([]);
    setResult(null);
    setMessage(null);
    setErrorMsg(null);
    setStake(0);
    setDoubled(false);
    setLoading(false);
  };

  const resultTone =
    result === 'player_blackjack' || result === 'player_win' || result === 'dealer_bust'
      ? 'win'
      : result === 'push'
        ? 'push'
        : result
          ? 'lose'
          : null;

  return (
    <div className="bj-page">
      <header className="bj-header">
        <div className="bj-header-left">
          {onBack && (
            <button type="button" onClick={onBack} className="bj-back">
              <ArrowLeft size={18} />
              <span>Voltar</span>
            </button>
          )}
          <div>
            <h1 className="bj-title">
              <span className="bj-title-icon" aria-hidden>
                🂡
              </span>
              21 dos Crias
            </h1>
            <p className="bj-subtitle">Blackjack clássico · solo vs banca</p>
          </div>
        </div>
        <div className="bj-header-badges">
          <span className="bj-badge solo">Solo</span>
          <span className="bj-badge gold">{balance} Kz</span>
        </div>
      </header>

      <div className="bj-layout">
        <div className="bj-main">
          <section className="bj-table" aria-live="polite">
            <div className="bj-table-felt">
              <div className="bj-table-glow" aria-hidden />
              <p className="bj-table-rule">Blackjack paga 3:2 · Banca para em 17</p>

              {/* Dealer */}
              <div className="bj-hand-block">
                <div className="bj-hand-meta">
                  <span className="bj-hand-label">Banca</span>
                  <span className={`bj-hand-total ${phase !== 'betting' ? 'on' : ''}`}>
                    {phase === 'betting'
                      ? '—'
                      : hideHole
                        ? formatHandTotal(dealer, true)
                        : `${dealerTotal.total}${dealerTotal.soft ? ' soft' : ''}`}
                  </span>
                </div>
                <div className="bj-cards" key={`d-${handId}`}>
                  <AnimatePresence mode="popLayout">
                    {dealer.length === 0 && phase === 'betting' && (
                      <div className="bj-cards-placeholder">Aguardando aposta…</div>
                    )}
                    {dealer.map((c, i) => (
                      <PlayingCard
                        key={c.id}
                        card={c}
                        faceDown={hideHole && i === 1}
                        delay={i * 0.08}
                      />
                    ))}
                  </AnimatePresence>
                </div>
              </div>

              <div className="bj-vs">
                <span>VS</span>
              </div>

              {/* Player */}
              <div className="bj-hand-block player">
                <div className="bj-hand-meta">
                  <span className="bj-hand-label">Você</span>
                  <span className={`bj-hand-total ${player.length ? 'on player' : ''}`}>
                    {player.length
                      ? `${playerTotal.total}${playerTotal.soft ? ' soft' : ''}`
                      : '—'}
                  </span>
                </div>
                <div className="bj-cards" key={`p-${handId}`}>
                  <AnimatePresence mode="popLayout">
                    {player.length === 0 && phase === 'betting' && (
                      <div className="bj-cards-placeholder">Suas cartas aqui</div>
                    )}
                    {player.map((c, i) => (
                      <PlayingCard key={c.id} card={c} delay={0.05 + i * 0.09} />
                    ))}
                  </AnimatePresence>
                </div>
              </div>

              {result && (
                <motion.div
                  className={`bj-result-banner ${resultTone}`}
                  initial={{ scale: 0.85, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                >
                  <Sparkles size={18} />
                  {resultLabel(result)}
                </motion.div>
              )}
            </div>
          </section>

          {(message || errorMsg) && (
            <div className="bj-alerts">
              {message && (
                <div className={`bj-alert ${resultTone === 'win' ? 'ok' : resultTone === 'push' ? 'info' : 'warn'}`}>
                  {message}
                </div>
              )}
              {errorMsg && <div className="bj-alert danger">{errorMsg}</div>}
            </div>
          )}

          <section className="bj-controls">
            {phase === 'betting' && (
              <>
                <p className="bj-controls-label">Valor da aposta</p>
                <div className="bj-bet-row">
                  <input
                    type="number"
                    min={1}
                    max={balance}
                    value={betAmount}
                    onChange={(e) => setBetAmount(Math.max(0, Number(e.target.value)))}
                    className="bj-bet-input"
                    aria-label="Aposta"
                  />
                  <button
                    type="button"
                    onClick={deal}
                    disabled={loading || betAmount < 1 || betAmount > balance}
                    className="bj-btn-deal"
                  >
                    {loading ? <Loader2 className="animate-spin" size={20} /> : 'Dar cartas'}
                  </button>
                </div>
                <div className="bj-presets">
                  {BET_PRESETS.map((v) => (
                    <button
                      key={v}
                      type="button"
                      disabled={v > balance}
                      onClick={() => setBetAmount(v)}
                      className={`bj-preset ${betAmount === v ? 'on' : ''}`}
                    >
                      {v}
                    </button>
                  ))}
                  <button
                    type="button"
                    disabled={balance < 1}
                    onClick={() => setBetAmount(Math.max(1, Math.floor(balance / 2)))}
                    className="bj-preset"
                  >
                    ½
                  </button>
                  <button
                    type="button"
                    disabled={balance < 1}
                    onClick={() => setBetAmount(Math.max(1, balance))}
                    className="bj-preset"
                  >
                    Max
                  </button>
                </div>
              </>
            )}

            {phase === 'playing' && (
              <div className="bj-action-row">
                <button type="button" onClick={hit} disabled={loading} className="bj-btn hit">
                  Pedir
                </button>
                <DodgingButton
                  active
                  dodgeChance={0.06}
                  onClick={stand}
                  disabled={loading}
                  className="bj-btn stand"
                >
                  Parar
                </DodgingButton>
                <button
                  type="button"
                  onClick={doubleDown}
                  disabled={!canDouble || loading}
                  className="bj-btn double"
                  title={!canDouble ? 'Só com 2 cartas e saldo p/ dobrar' : 'Dobrar aposta + 1 carta'}
                >
                  Dobrar
                </button>
              </div>
            )}

            {phase === 'dealer' && (
              <div className="bj-alert info center">
                <Loader2 className="animate-spin inline" size={16} /> Banca jogando…
              </div>
            )}

            {phase === 'result' && (
              <button type="button" onClick={newRound} className="bj-btn-deal full">
                Nova mão
              </button>
            )}

            {stake > 0 && phase !== 'betting' && (
              <p className="bj-stake-line">
                Em jogo: <strong>{stake} Kz</strong>
                {doubled ? ' · dobrou' : ''}
                {phase === 'playing' && player.length === 2
                  ? ` · se parar agora: até ${stake * 2} Kz`
                  : ''}
              </p>
            )}
          </section>

          <p className="bj-footer">
            <AlertTriangle size={12} />
            Sátira · 21 solo · ganhos avisam o site inteiro
          </p>
        </div>

        <aside className="bj-side">
          <div className="bj-howto">
            <h3>Como joga</h3>
            <ol>
              <li>
                <span>1</span> Aposta e recebe 2 cartas
              </li>
              <li>
                <span>2</span> Chega o mais perto de <strong>21</strong>
              </li>
              <li>
                <span>3</span> Ás = 1 ou 11 · J/Q/K = 10
              </li>
              <li>
                <span>4</span> <strong>Pedir</strong> carta ou <strong>Parar</strong>
              </li>
              <li>
                <span>5</span> Blackjack natural paga <strong>3:2</strong>
              </li>
              <li>
                <span>6</span> Banca compra até 17
              </li>
            </ol>
          </div>
          <RichLeaderboard currentUserId={user.id} limit={8} compact />
        </aside>
      </div>
    </div>
  );
}
