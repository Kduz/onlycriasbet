'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { AlertTriangle, ArrowLeft, Loader2, Sparkles } from 'lucide-react';
import { payAffiliateCommission } from '../lib/affiliate';
import { creditHouseBank } from '../lib/house-bank';
import {
  SLOT_CELLS,
  SLOT_COLS,
  SLOT_PAYLINES,
  SLOT_ROWS,
  SLOT_SYMBOLS,
  evaluateSpin,
  payoutForSpin,
  spinGrid,
  symbolSrc,
  type LineWin,
  type SlotSymbolId,
} from '../lib/tiger-slot';
import { useGameToasts } from './GameToastProvider';
import { FantasyBanner, FantasyFrame, GemIcon } from './FantasyDecor';
import RichLeaderboard from './RichLeaderboard';

type ProfileUser = { id: string; email?: string | null };

type TigerSlotGameProps = {
  user: ProfileUser;
  balance: number;
  onBalanceChange: (n: number) => void;
  onBack?: () => void;
  updateBalance: (userId: string, balance: number) => Promise<{ error: Error | null }>;
};

const BET_PRESETS = [5, 10, 20, 50, 100];

/** Tempo base até a 1ª coluna parar + espaçamento (dopamina). */
const SPIN_BASE_MS = 1400;
const SPIN_COL_STAGGER_MS = 380;
const TICK_MS = 55;
/** Pausa depois da última coluna antes de ligar as linhas. */
const AFTER_LAND_MS = 280;
const LINE_DRAW_MS = 500;
/** Pausa entre spins no auto. */
const AUTO_GAP_MS = 450;

const AUTO_COUNT_PRESETS = [5, 10, 20, 50];

const LINE_COLORS = [
  '#f0c14b',
  '#4d9fff',
  '#6bcf7a',
  '#ff8c42',
  '#e0b3ff',
  '#ff6b9d',
  '#ffe082',
  '#5eb0ff',
  '#86efac',
];

type Phase = 'idle' | 'spinning' | 'reveal' | 'result';

type WinLinePath = {
  id: string;
  points: string;
  color: string;
  dash: number;
};

function randomSymbol(): SlotSymbolId {
  const i = Math.floor(Math.random() * SLOT_SYMBOLS.length);
  return SLOT_SYMBOLS[i].id;
}

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

export default function TigerSlotGame({
  user,
  balance,
  onBalanceChange,
  onBack,
  updateBalance,
}: TigerSlotGameProps) {
  const { pushOutcome } = useGameToasts();
  const [phase, setPhase] = useState<Phase>('idle');
  const [betAmount, setBetAmount] = useState(10);
  const [grid, setGrid] = useState<SlotSymbolId[]>(() => spinGrid());
  const [wins, setWins] = useState<LineWin[]>([]);
  const [totalMult, setTotalMult] = useState(0);
  const [highlight, setHighlight] = useState<Set<number>>(() => new Set());
  const [spinningCols, setSpinningCols] = useState<boolean[]>(() =>
    Array(SLOT_COLS).fill(false)
  );
  const [winPaths, setWinPaths] = useState<WinLinePath[]>([]);
  const [linesVisible, setLinesVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  /** Quantas rodadas o auto vai fazer (ex: 5). */
  const [autoCount, setAutoCount] = useState(5);
  /** Rodadas restantes no auto em curso. */
  const [autoLeft, setAutoLeft] = useState(0);
  const [autoTotal, setAutoTotal] = useState(0);
  const busyRef = useRef(false);
  const boardRef = useRef<HTMLDivElement>(null);
  const spinTokenRef = useRef(0);
  const balanceRef = useRef(balance);
  const autoStopRef = useRef(false);

  useEffect(() => {
    balanceRef.current = balance;
  }, [balance]);

  const paylineCount = SLOT_PAYLINES.length;
  const anySpinning = spinningCols.some(Boolean);
  const autoRunning = autoLeft > 0;

  const buildWinPaths = useCallback((lineWins: LineWin[]): WinLinePath[] => {
    const board = boardRef.current;
    if (!board || lineWins.length === 0) return [];

    const boardRect = board.getBoundingClientRect();
    const paths: WinLinePath[] = [];

    lineWins.forEach((w, idx) => {
      const pts: string[] = [];
      for (const cellIdx of w.cells) {
        const el = board.querySelector<HTMLElement>(`[data-cell="${cellIdx}"]`);
        if (!el) continue;
        const r = el.getBoundingClientRect();
        const x = r.left - boardRect.left + r.width / 2;
        const y = r.top - boardRect.top + r.height / 2;
        pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
      }
      if (pts.length < 2) return;
      paths.push({
        id: w.payline.id,
        points: pts.join(' '),
        color: LINE_COLORS[idx % LINE_COLORS.length],
        dash: 0,
      });
    });

    return paths;
  }, []);

  /**
   * Um spin completo. `bal` = saldo atual (ref no auto).
   * Devolve o saldo depois do spin (ou null se falhou).
   */
  const runOneSpin = useCallback(
    async (stake: number, bal: number): Promise<number | null> => {
      if (stake < 1) {
        setErrorMsg('Minimo 1 Kz');
        return null;
      }
      if (stake > bal) {
        setErrorMsg('Saldo insuficiente');
        return null;
      }

      setErrorMsg(null);
      setMessage(null);
      setPhase('spinning');
      setWins([]);
      setTotalMult(0);
      setHighlight(new Set());
      setWinPaths([]);
      setLinesVisible(false);

      const afterDebit = bal - stake;
      const { error } = await updateBalance(user.id, afterDebit);
      if (error) {
        setErrorMsg(error.message);
        setPhase('idle');
        return null;
      }
      onBalanceChange(afterDebit);
      balanceRef.current = afterDebit;

      const token = ++spinTokenRef.current;
      const finalGrid = spinGrid();

      const spinningRef = { current: Array(SLOT_COLS).fill(true) as boolean[] };
      setSpinningCols([...spinningRef.current]);

      const tickId = window.setInterval(() => {
        if (spinTokenRef.current !== token) return;
        setGrid((prev) => {
          const next = [...prev];
          for (let c = 0; c < SLOT_COLS; c++) {
            if (!spinningRef.current[c]) continue;
            for (let r = 0; r < SLOT_ROWS; r++) {
              next[r * SLOT_COLS + c] = randomSymbol();
            }
          }
          return next;
        });
      }, TICK_MS);

      for (let c = 0; c < SLOT_COLS; c++) {
        await sleep(c === 0 ? SPIN_BASE_MS : SPIN_COL_STAGGER_MS);
        if (spinTokenRef.current !== token) {
          window.clearInterval(tickId);
          return balanceRef.current;
        }
        spinningRef.current[c] = false;
        setSpinningCols([...spinningRef.current]);
        setGrid((prev) => {
          const next = [...prev];
          for (let r = 0; r < SLOT_ROWS; r++) {
            next[r * SLOT_COLS + c] = finalGrid[r * SLOT_COLS + c];
          }
          return next;
        });
      }

      window.clearInterval(tickId);
      setGrid(finalGrid);
      setSpinningCols(Array(SLOT_COLS).fill(false));

      await sleep(AFTER_LAND_MS);
      if (spinTokenRef.current !== token) {
        return balanceRef.current;
      }

      setPhase('reveal');
      const result = evaluateSpin(finalGrid);
      setWins(result.wins);
      setTotalMult(result.totalMult);

      const cells = new Set<number>();
      result.wins.forEach((w) => w.cells.forEach((c) => cells.add(c)));
      setHighlight(cells);

      if (result.wins.length > 0) {
        await sleep(40);
        const paths = buildWinPaths(result.wins);
        setWinPaths(paths);
        setLinesVisible(true);
        await sleep(LINE_DRAW_MS);
      }

      const payout = payoutForSpin(stake, result.totalMult);
      let newBal = afterDebit;

      if (payout > 0) {
        newBal = afterDebit + payout;
        const { error: winErr } = await updateBalance(user.id, newBal);
        if (!winErr) {
          onBalanceChange(newBal);
          balanceRef.current = newBal;
          const profit = payout - stake;
          pushOutcome({
            kind: 'win',
            amount: Math.max(1, profit > 0 ? profit : payout),
            game: 'tigrinho',
            gameLabel: 'Tigrinho dos Crias',
            detail: `${result.wins.length} linha(s) · ${result.totalMult.toFixed(1)}x`,
          });
          const commission = await payAffiliateCommission(
            user.id,
            Math.max(1, profit > 0 ? profit : payout)
          );
          const aff = commission > 0 ? ` · afiliado +${commission} Kz` : '';
          const lines = result.wins
            .map(
              (w) =>
                `${w.count}x ${SLOT_SYMBOLS.find((s) => s.id === w.symbol)?.label}`
            )
            .slice(0, 3)
            .join(' · ');
          setMessage(
            `+${payout} Kz · mult ${result.totalMult.toFixed(1)}x${aff}${
              lines ? ` · ${lines}` : ''
            }`
          );
        } else {
          setErrorMsg(winErr.message);
          newBal = afterDebit;
        }
      } else {
        setMessage(`Sem linha · −${stake} Kz`);
        void creditHouseBank(stake, 'tigrinho', 'sem linha');
      }

      setPhase('result');
      return newBal;
    },
    [user.id, updateBalance, onBalanceChange, pushOutcome, buildWinPaths]
  );

  const spin = useCallback(async () => {
    if (busyRef.current || autoLeft > 0) return;

    busyRef.current = true;
    setLoading(true);
    await runOneSpin(betAmount, balanceRef.current);
    setLoading(false);
    busyRef.current = false;
  }, [betAmount, runOneSpin, autoLeft]);

  const stopAuto = useCallback(() => {
    autoStopRef.current = true;
    setMessage('A parar o auto apos este spin…');
  }, []);

  const startAuto = useCallback(async () => {
    if (busyRef.current) return;
    if (betAmount < 1) return setErrorMsg('Minimo 1 Kz');
    if (autoCount < 1) return setErrorMsg('Escolhe quantas rodadas');

    const stake = betAmount;
    const total = autoCount;

    if (balanceRef.current < stake) {
      return setErrorMsg('Saldo insuficiente');
    }

    autoStopRef.current = false;
    busyRef.current = true;
    setLoading(true);
    setErrorMsg(null);
    setAutoTotal(total);
    setAutoLeft(total);

    const balStart = balanceRef.current;
    let bal = balStart;
    let done = 0;
    let winCount = 0;
    let payoutSum = 0;

    for (let i = 0; i < total; i++) {
      if (autoStopRef.current) break;
      if (bal < stake) {
        setErrorMsg('Saldo insuficiente no auto');
        break;
      }

      setAutoLeft(total - i);
      setMessage(`Auto ${i + 1}/${total} · ${stake} Kz cada`);

      const afterDebit = bal - stake;
      const after = await runOneSpin(stake, bal);
      if (after == null) break;
      bal = after;
      balanceRef.current = bal;
      done += 1;

      const spinPayout = Math.max(0, bal - afterDebit);
      if (spinPayout > 0) {
        winCount += 1;
        payoutSum += spinPayout;
      }

      if (autoStopRef.current) break;
      if (i < total - 1) await sleep(AUTO_GAP_MS);
    }

    setAutoLeft(0);
    setAutoTotal(0);
    setLoading(false);
    busyRef.current = false;
    autoStopRef.current = false;

    if (done > 0) {
      const spent = stake * done;
      const net = bal - balStart;
      const netMsg =
        net >= 0 ? `lucro +${net} Kz` : `prejuizo ${net} Kz`;
      setMessage(
        `Auto fim · ${done}/${total} · ${winCount} win · gasto ${spent} · recebido ${payoutSum} · ${netMsg}`
      );
    }
  }, [betAmount, autoCount, runOneSpin]);

  // Recalcula linhas no resize
  useEffect(() => {
    if (wins.length === 0 || phase === 'spinning') return;
    const onResize = () => setWinPaths(buildWinPaths(wins));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [wins, phase, buildWinPaths]);

  const lineLabels = useMemo(() => {
    if (wins.length === 0) return null;
    return wins.map((w) => (
      <li key={w.payline.id}>
        <strong>{w.payline.label}</strong>: {w.count}×{' '}
        {SLOT_SYMBOLS.find((s) => s.id === w.symbol)?.label} · {w.mult}x
      </li>
    ));
  }, [wins]);

  return (
    <div className="tig-page">
      <header className="tig-top">
        <div className="tig-top-left">
          {onBack && (
            <button type="button" onClick={onBack} className="tig-back">
              <ArrowLeft size={18} />
              <span>Voltar</span>
            </button>
          )}
          <div>
            <h1 className="tig-title">Tigrinho dos Crias</h1>
            <p className="tig-sub">
              Fileiras + diagonais · {paylineCount} linhas
            </p>
          </div>
        </div>
        <div className="tig-badges">
          <span className="tig-badge solo">Solo</span>
          <span className="tig-badge gold">
            <GemIcon kind="blue" size={16} /> {balance} Kz
          </span>
        </div>
      </header>

      <div className="tig-layout">
        <div className="tig-main">
          <FantasyBanner
            title="Tigrinho"
            subtitle="Gira ate cair · linhas ligam os iguais"
          />

          <FantasyFrame className="tig-machine">
            <div
              ref={boardRef}
              className={`tig-grid ${anySpinning ? 'is-spinning' : ''} ${
                linesVisible ? 'has-lines' : ''
              }`}
              style={
                {
                  '--cols': SLOT_COLS,
                  '--rows': SLOT_ROWS,
                } as CSSProperties
              }
            >
              {Array.from({ length: SLOT_CELLS }, (_, i) => {
                const col = i % SLOT_COLS;
                const sym = grid[i];
                const lit = highlight.has(i) && !anySpinning;
                const colSpin = spinningCols[col];
                return (
                  <div
                    key={i}
                    data-cell={i}
                    className={`tig-cell ${lit ? 'is-win' : ''} ${
                      colSpin ? 'is-col-spin' : ''
                    } ${!colSpin && phase === 'spinning' ? 'is-landed' : ''}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={symbolSrc(sym)}
                      alt={sym}
                      draggable={false}
                      className="tig-sym"
                    />
                  </div>
                );
              })}

              {/* Linhas a ligar simbolos iguais */}
              <svg
                className={`tig-lines-svg ${linesVisible ? 'is-on' : ''}`}
                aria-hidden
              >
                {winPaths.map((p) => (
                  <polyline
                    key={p.id}
                    className="tig-win-line"
                    points={p.points}
                    stroke={p.color}
                    fill="none"
                    strokeWidth={5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                ))}
                {winPaths.map((p) => (
                  <polyline
                    key={`${p.id}-glow`}
                    className="tig-win-line-glow"
                    points={p.points}
                    stroke={p.color}
                    fill="none"
                    strokeWidth={12}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                ))}
              </svg>
            </div>

            {totalMult > 0 && !anySpinning && (
              <div className="tig-win-banner">
                <Sparkles size={16} />
                Mult total {totalMult.toFixed(1)}x
              </div>
            )}

            {anySpinning && (
              <p className="tig-spinning-label">A girar… as colunas vao caindo</p>
            )}
          </FantasyFrame>

          {message && !anySpinning && (
            <div
              className={`tig-alert ${
                totalMult > 0 ? 'ok' : message.includes('Sem') ? 'bad' : 'info'
              }`}
            >
              {message}
            </div>
          )}
          {errorMsg && <div className="tig-alert bad">{errorMsg}</div>}

          {wins.length > 0 && !anySpinning && (
            <FantasyFrame compact>
              <p className="tig-lines-title">Linhas que pagaram</p>
              <ul className="tig-lines">{lineLabels}</ul>
            </FantasyFrame>
          )}

          <FantasyFrame compact className="tig-controls">
            <p className="tig-ctrl-label">Aposta por spin</p>
            <div className="tig-bet-row">
              <input
                type="number"
                min={1}
                max={balance}
                value={betAmount}
                disabled={loading || autoRunning}
                onChange={(e) => setBetAmount(Math.max(0, Number(e.target.value)))}
                className="tig-bet-input"
                aria-label="Aposta"
              />
              <button
                type="button"
                onClick={() => void spin()}
                disabled={
                  loading ||
                  autoRunning ||
                  betAmount < 1 ||
                  betAmount > balance
                }
                className="btn btn-purple tig-spin"
              >
                {loading && !autoRunning ? (
                  <Loader2 className="animate-spin" size={20} />
                ) : (
                  'GIRAR'
                )}
              </button>
            </div>
            <div className="tig-presets">
              {BET_PRESETS.map((v) => (
                <button
                  key={v}
                  type="button"
                  disabled={v > balance || loading || autoRunning}
                  onClick={() => setBetAmount(v)}
                  className={`chip ${betAmount === v ? 'chip-active' : ''}`}
                >
                  {v}
                </button>
              ))}
            </div>

            {/* Auto slot: ex. 5x de 5 Kz */}
            <div className="tig-auto">
              <p className="tig-ctrl-label">Auto slot</p>
              <p className="tig-auto-desc">
                Ex.: aposta {betAmount || 5} Kz × {autoCount} ={' '}
                <strong>{(betAmount || 0) * autoCount} Kz</strong> no maximo
              </p>
              <div className="tig-auto-row">
                <span className="tig-auto-label">Rodadas</span>
                <div className="tig-presets tig-auto-presets">
                  {AUTO_COUNT_PRESETS.map((n) => (
                    <button
                      key={n}
                      type="button"
                      disabled={loading || autoRunning}
                      onClick={() => setAutoCount(n)}
                      className={`chip ${autoCount === n ? 'chip-active' : ''}`}
                    >
                      {n}x
                    </button>
                  ))}
                </div>
              </div>
              {autoRunning ? (
                <button
                  type="button"
                  onClick={stopAuto}
                  className="btn btn-danger-outline w-full tig-auto-btn"
                >
                  Parar auto ({autoTotal - autoLeft + 1}/{autoTotal})
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void startAuto()}
                  disabled={
                    loading ||
                    betAmount < 1 ||
                    betAmount > balance ||
                    autoCount < 1
                  }
                  className="btn btn-success w-full tig-auto-btn"
                >
                  AUTO {autoCount}× · {betAmount} Kz
                </button>
              )}
            </div>

            <p className="tig-hint">
              Auto gira sozinho · podes parar a meio · linhas ligam os iguais
            </p>
          </FantasyFrame>

          <FantasyFrame compact>
            <p className="tig-pay-title">Tabela rapida</p>
            <div className="tig-paytable">
              {SLOT_SYMBOLS.slice(0, 5).map((s) => (
                <div key={s.id} className="tig-pay-row">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={s.src} alt="" className="tig-pay-ico" />
                  <span className="tig-pay-name">{s.label}</span>
                  <span className="tig-pay-m">3→{s.mult3}x</span>
                  <span className="tig-pay-m">4→{s.mult4}x</span>
                  <span className="tig-pay-m hot">5→{s.mult5}x</span>
                </div>
              ))}
            </div>
          </FantasyFrame>

          <p className="tig-footer">
            <AlertTriangle size={12} />
            Satira · estilo tigrinho · fileiras e diagonais
          </p>
        </div>

        <aside className="tig-side">
          <FantasyFrame compact>
            <h3 className="tig-howto-title">Como joga</h3>
            <ol className="tig-howto">
              <li>
                <span>1</span> Aposta e clica <strong>GIRAR</strong>
              </li>
              <li>
                <span>2</span> As colunas giram e caem uma a uma
              </li>
              <li>
                <span>3</span> 3+ iguais na fileira ou diagonal
              </li>
              <li>
                <span>4</span> Uma <strong>linha</strong> liga os simbolos
              </li>
              <li>
                <span>5</span> Varias linhas somam o multiplo
              </li>
            </ol>
          </FantasyFrame>
          <RichLeaderboard currentUserId={user.id} limit={8} compact />
        </aside>
      </div>
    </div>
  );
}
