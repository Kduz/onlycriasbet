'use client';

import { useMemo } from 'react';
import {
  SLOT_COUNT,
  SLOT_STEP,
  WHEEL,
  colorHex,
  type RoulettePhase,
  type WheelSlot,
} from '../lib/roulette';

type RouletteWheelProps = {
  phase: RoulettePhase;
  wheelDeg: number;
  ballDeg: number;
  result: WheelSlot;
  spinProgress: number;
};

export default function RouletteWheel({
  phase,
  wheelDeg,
  ballDeg,
  result,
  spinProgress,
}: RouletteWheelProps) {
  const size = 320;
  const cx = size / 2;
  const cy = size / 2;
  const outerR = 148;
  const trackR = 132;
  const pocketOuter = 118;
  const pocketInner = 72;
  const hubR = 38;

  const pockets = useMemo(() => {
    return WHEEL.map((slot, i) => {
      const a0 = ((i * SLOT_STEP - 90) * Math.PI) / 180;
      const a1 = (((i + 1) * SLOT_STEP - 90) * Math.PI) / 180;
      const mid = ((i * SLOT_STEP + SLOT_STEP / 2 - 90) * Math.PI) / 180;

      const x0o = cx + pocketOuter * Math.cos(a0);
      const y0o = cy + pocketOuter * Math.sin(a0);
      const x1o = cx + pocketOuter * Math.cos(a1);
      const y1o = cy + pocketOuter * Math.sin(a1);
      const x0i = cx + pocketInner * Math.cos(a0);
      const y0i = cy + pocketInner * Math.sin(a0);
      const x1i = cx + pocketInner * Math.cos(a1);
      const y1i = cy + pocketInner * Math.sin(a1);

      const large = SLOT_STEP > 180 ? 1 : 0;
      const d = [
        `M ${x0o} ${y0o}`,
        `A ${pocketOuter} ${pocketOuter} 0 ${large} 1 ${x1o} ${y1o}`,
        `L ${x1i} ${y1i}`,
        `A ${pocketInner} ${pocketInner} 0 ${large} 0 ${x0i} ${y0i}`,
        'Z',
      ].join(' ');

      const labelR = (pocketOuter + pocketInner) / 2;
      const lx = cx + labelR * Math.cos(mid);
      const ly = cy + labelR * Math.sin(mid);

      return { slot, d, lx, ly, mid };
    });
  }, []);

  // Bolinha no trilho (ângulo 0 = topo)
  const ballRad = ((ballDeg - 90) * Math.PI) / 180;
  const ballX = cx + trackR * Math.cos(ballRad);
  const ballY = cy + trackR * Math.sin(ballRad);
  const ballBlur = phase === 'spinning' ? Math.max(0, 1 - spinProgress) * 1.2 : 0;

  const frets = Array.from({ length: SLOT_COUNT }, (_, i) => {
    const a = ((i * SLOT_STEP - 90) * Math.PI) / 180;
    return {
      x1: cx + pocketInner * Math.cos(a),
      y1: cy + pocketInner * Math.sin(a),
      x2: cx + pocketOuter * Math.cos(a),
      y2: cy + pocketOuter * Math.sin(a),
    };
  });

  return (
    <div className="rw-root">
      <div className="rw-glow" />
      <svg
        viewBox={`0 0 ${size} ${size}`}
        className="rw-svg"
        role="img"
        aria-label={
          phase === 'result'
            ? `Resultado ${result.number}`
            : phase === 'spinning'
              ? 'Roleta girando'
              : 'Roleta aguardando apostas'
        }
      >
        <defs>
          <radialGradient id="rwWood" cx="50%" cy="45%" r="60%">
            <stop offset="0%" stopColor="#3b2a1a" />
            <stop offset="55%" stopColor="#1a120c" />
            <stop offset="100%" stopColor="#0a0705" />
          </radialGradient>
          <linearGradient id="rwGold" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#f5d78e" />
            <stop offset="40%" stopColor="#c9a227" />
            <stop offset="100%" stopColor="#8a6a14" />
          </linearGradient>
          <linearGradient id="rwGoldSoft" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#e8d5a3" />
            <stop offset="100%" stopColor="#a67c1a" />
          </linearGradient>
          <radialGradient id="rwHub" cx="40%" cy="35%" r="65%">
            <stop offset="0%" stopColor="#4c3a6e" />
            <stop offset="100%" stopColor="#140f22" />
          </radialGradient>
          <filter id="rwBallShadow" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="1" stdDeviation="1.5" floodOpacity="0.55" />
          </filter>
          <filter id="rwSoft" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="0.6" />
          </filter>
        </defs>

        {/* Mesa / base */}
        <circle cx={cx} cy={cy} r={outerR + 8} fill="url(#rwWood)" />
        <circle
          cx={cx}
          cy={cy}
          r={outerR + 4}
          fill="none"
          stroke="url(#rwGold)"
          strokeWidth="5"
        />
        <circle
          cx={cx}
          cy={cy}
          r={outerR - 2}
          fill="none"
          stroke="rgba(192,132,252,0.25)"
          strokeWidth="2"
        />

        {/* Trilho da bolinha */}
        <circle
          cx={cx}
          cy={cy}
          r={trackR}
          fill="none"
          stroke="rgba(0,0,0,0.45)"
          strokeWidth="14"
        />
        <circle
          cx={cx}
          cy={cy}
          r={trackR}
          fill="none"
          stroke="url(#rwGoldSoft)"
          strokeWidth="1.5"
          opacity="0.55"
        />

        {/* Roda (bolsos) */}
        <g
          style={{
            transform: `rotate(${wheelDeg}deg)`,
            transformOrigin: `${cx}px ${cy}px`,
          }}
        >
          {pockets.map(({ slot, d, lx, ly }) => (
            <g key={slot.number}>
              <path
                d={d}
                fill={colorHex(slot.color)}
                stroke="rgba(245,215,140,0.35)"
                strokeWidth="0.8"
              />
              <text
                x={lx}
                y={ly}
                textAnchor="middle"
                dominantBaseline="central"
                fill={slot.color === 'white' ? '#1c1917' : '#fafafa'}
                fontSize="11"
                fontWeight="800"
                fontFamily="system-ui, sans-serif"
                style={{ userSelect: 'none' }}
              >
                {slot.number}
              </text>
            </g>
          ))}

          {frets.map((f, i) => (
            <line
              key={i}
              x1={f.x1}
              y1={f.y1}
              x2={f.x2}
              y2={f.y2}
              stroke="rgba(245,215,140,0.45)"
              strokeWidth="1"
            />
          ))}

          {/* anel interno */}
          <circle
            cx={cx}
            cy={cy}
            r={pocketInner}
            fill="none"
            stroke="url(#rwGold)"
            strokeWidth="2.5"
          />
        </g>

        {/* Cubo central */}
        <circle cx={cx} cy={cy} r={hubR + 4} fill="url(#rwGold)" opacity="0.9" />
        <circle cx={cx} cy={cy} r={hubR} fill="url(#rwHub)" />
        <circle
          cx={cx}
          cy={cy}
          r={hubR - 8}
          fill="none"
          stroke="rgba(192,132,252,0.35)"
          strokeWidth="1.5"
        />
        <text
          x={cx}
          y={cy + 1}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize="16"
        >
          🎰
        </text>

        {/* Ponteiro */}
        <polygon
          points={`${cx},${cy - outerR + 6} ${cx - 9},${cy - outerR + 22} ${cx + 9},${cy - outerR + 22}`}
          fill="url(#rwGold)"
          stroke="#7c5a12"
          strokeWidth="0.6"
        />

        {/* Bolinha */}
        <g filter="url(#rwBallShadow)" style={{ opacity: phase === 'betting' ? 0.35 : 1 }}>
          <circle
            cx={ballX}
            cy={ballY}
            r={6.5}
            fill="#f8fafc"
            stroke="rgba(192,132,252,0.5)"
            strokeWidth="1"
            style={{
              filter: ballBlur > 0.05 ? `blur(${ballBlur}px)` : undefined,
            }}
          />
          <circle cx={ballX - 1.5} cy={ballY - 1.8} r={2} fill="rgba(255,255,255,0.85)" />
        </g>
      </svg>

      {phase === 'spinning' && (
        <div className="rw-spin-tag">Girando…</div>
      )}
    </div>
  );
}
