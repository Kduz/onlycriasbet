'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Phase } from '../lib/crash-engine';
import { shortName } from '../lib/live-presence';
import type { LiveMarker } from '../lib/live-presence';

type CrashChartProps = {
  phase: Phase;
  multiplier: number;
  crashPoint: number;
  roundIndex: number;
  /** Saques (verde) e crashes (vermelho) de jogadores */
  markers?: LiveMarker[];
};

type Point = { x: number; y: number };

const W = 640;
const H = 200;
const PAD = { top: 24, right: 36, bottom: 28, left: 44 };
const MAX_HISTORY = 220;

export default function CrashChart({
  phase,
  multiplier,
  crashPoint,
  roundIndex,
  markers = [],
}: CrashChartProps) {
  const [points, setPoints] = useState<Point[]>([]);
  const lastRound = useRef(roundIndex);
  const sampleRef = useRef(0);
  const crashLogged = useRef(false);

  useEffect(() => {
    if (roundIndex !== lastRound.current) {
      lastRound.current = roundIndex;
      setPoints([]);
      sampleRef.current = 0;
      crashLogged.current = false;
    }
  }, [roundIndex]);

  useEffect(() => {
    if (phase === 'betting') {
      setPoints([]);
      sampleRef.current = 0;
      crashLogged.current = false;
      return;
    }

    if (phase === 'flying') {
      crashLogged.current = false;
      const t = sampleRef.current++;
      const m = Math.max(1, multiplier);
      setPoints((prev) => {
        const next = [...prev, { x: t, y: m }];
        return next.length > MAX_HISTORY ? next.slice(-MAX_HISTORY) : next;
      });
      return;
    }

    if (phase === 'crashed' && !crashLogged.current) {
      crashLogged.current = true;
      const t = sampleRef.current++;
      const m = Math.max(1, crashPoint || multiplier);
      setPoints((prev) => [...prev, { x: t, y: m }]);
    }
  }, [phase, multiplier, crashPoint]);

  const peakY = useMemo(() => {
    const fromPoints = points.reduce((m, p) => Math.max(m, p.y), 1);
    const fromMarkers = markers.reduce((m, mk) => Math.max(m, mk.multiplier ?? 1), 1);
    return Math.max(
      2,
      fromPoints,
      fromMarkers,
      phase === 'flying' ? multiplier : 1,
      crashPoint || 1
    );
  }, [points, multiplier, crashPoint, phase, markers]);

  const maxY = peakY * 1.18;

  const maxX = useMemo(() => {
    if (points.length < 2) return 40;
    return Math.max(40, points[points.length - 1].x * 1.02);
  }, [points]);

  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  const toX = (x: number) => PAD.left + (x / maxX) * plotW;
  const toY = (y: number) => {
    const span = Math.max(0.01, maxY - 1);
    return PAD.top + plotH - ((Math.max(1, y) - 1) / span) * plotH;
  };

  const pathPoints = useMemo(() => {
    return points.map((p) => ({
      sx: toX(p.x),
      sy: toY(p.y),
      y: p.y,
      x: p.x,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, maxX, maxY]);

  const pathD = useMemo(() => {
    if (pathPoints.length === 0) return '';
    return pathPoints
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.sx.toFixed(2)} ${p.sy.toFixed(2)}`)
      .join(' ');
  }, [pathPoints]);

  const areaD = useMemo(() => {
    if (pathPoints.length < 2 || !pathD) return '';
    const baseY = PAD.top + plotH;
    const first = pathPoints[0];
    const last = pathPoints[pathPoints.length - 1];
    return `${pathD} L ${last.sx.toFixed(2)} ${baseY} L ${first.sx.toFixed(2)} ${baseY} Z`;
  }, [pathD, pathPoints, plotH]);

  const tip =
    pathPoints.length > 0
      ? pathPoints[pathPoints.length - 1]
      : { sx: PAD.left + 12, sy: PAD.top + plotH - 4, y: 1 };

  const placeForMult = (mult: number) => {
    const m = Math.max(1, mult);
    if (pathPoints.length === 0) {
      return { sx: PAD.left + 20, sy: toY(m) };
    }
    let best = pathPoints[0];
    for (const p of pathPoints) {
      best = p;
      if (p.y >= m) break;
    }
    return { sx: best.sx, sy: toY(m) };
  };

  const crashed = phase === 'crashed';
  const flying = phase === 'flying';
  const waiting = phase === 'betting';

  const labels = [1, 1 + (maxY - 1) * 0.33, 1 + (maxY - 1) * 0.66, maxY];

  let tilt = -8;
  if (pathPoints.length >= 2) {
    const a = pathPoints[pathPoints.length - 2];
    const b = pathPoints[pathPoints.length - 1];
    const dx = b.sx - a.sx;
    const dy = b.sy - a.sy;
    if (Math.abs(dx) > 0.001) {
      tilt = (Math.atan2(dy, dx) * 180) / Math.PI;
      tilt = Math.max(-55, Math.min(15, tilt));
    }
  }

  const exitMarkers = markers.filter(
    (m) =>
      (m.kind === 'cashout' || m.kind === 'crash') &&
      typeof m.multiplier === 'number' &&
      m.multiplier >= 1
  );

  return (
    <div className="crash-chart">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="crash-chart-svg"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={`Gráfico do multiplo em ${multiplier.toFixed(2)}x`}
      >
        <defs>
          <linearGradient id="trailFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={crashed ? '#fb7185' : '#a855f7'} stopOpacity="0.42" />
            <stop offset="100%" stopColor={crashed ? '#fb7185' : '#a855f7'} stopOpacity="0.02" />
          </linearGradient>
          <linearGradient id="trailStroke" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={crashed ? '#fda4af' : '#c084fc'} />
            <stop offset="100%" stopColor={crashed ? '#fb7185' : '#f472b6'} />
          </linearGradient>
          <filter id="softGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3.2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <rect x="0" y="0" width={W} height={H} rx="14" fill="#0a0912" />

        {labels.map((gy, i) => {
          const y = toY(gy);
          return (
            <g key={i}>
              <line
                x1={PAD.left}
                y1={y}
                x2={W - PAD.right}
                y2={y}
                stroke="rgba(167,139,250,0.12)"
                strokeDasharray="4 6"
              />
              <text
                x={PAD.left - 8}
                y={y + 3.5}
                textAnchor="end"
                fill="#7c7394"
                fontSize="11"
                fontFamily="ui-monospace, monospace"
              >
                {gy.toFixed(1)}x
              </text>
            </g>
          );
        })}

        <line
          x1={PAD.left}
          y1={PAD.top + plotH}
          x2={W - PAD.right}
          y2={PAD.top + plotH}
          stroke="rgba(167,139,250,0.22)"
        />

        {areaD && <path d={areaD} fill="url(#trailFill)" />}

        {pathD && (
          <path
            d={pathD}
            fill="none"
            stroke="url(#trailStroke)"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            filter="url(#softGlow)"
          />
        )}

        {/* Marcadores de jogadores (saque verde / morte vermelha) */}
        {exitMarkers.map((m) => {
          const pos = placeForMult(m.multiplier ?? 1);
          const ok = m.kind === 'cashout';
          const name = shortName(m.playerLabel);
          return (
            <g key={m.id} transform={`translate(${pos.sx}, ${pos.sy})`}>
              <text
                y={-16}
                textAnchor="middle"
                fill={ok ? '#86efac' : '#fda4af'}
                fontSize="9"
                fontWeight="700"
                fontFamily="system-ui, sans-serif"
              >
                {name}
              </text>
              <text
                y={-5}
                textAnchor="middle"
                fontSize="14"
                style={{ userSelect: 'none' }}
              >
                {ok ? '✈️' : '💥'}
              </text>
              <text
                y={10}
                textAnchor="middle"
                fill={ok ? '#4ade80' : '#fb7185'}
                fontSize="8"
                fontWeight="700"
                fontFamily="ui-monospace, monospace"
              >
                {(m.multiplier ?? 0).toFixed(2)}x
              </text>
            </g>
          );
        })}

        {!waiting && (
          <g
            transform={`translate(${tip.sx.toFixed(2)}, ${tip.sy.toFixed(2)}) rotate(${flying ? tilt : 0})`}
          >
            {crashed ? (
              <>
                <circle r="16" fill="rgba(251,113,133,0.22)" stroke="#fb7185" strokeWidth="2" />
                <text textAnchor="middle" dominantBaseline="central" fontSize="26">
                  💥
                </text>
                <text
                  y={-28}
                  textAnchor="middle"
                  fill="#fda4af"
                  fontSize="12"
                  fontWeight="700"
                  fontFamily="system-ui, sans-serif"
                >
                  {crashPoint.toFixed(2)}x
                </text>
              </>
            ) : (
              <>
                {flying && (
                  <line
                    x1={-14}
                    y1={-10}
                    x2={14}
                    y2={-10}
                    stroke="rgba(233,213,255,0.85)"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  >
                    <animate
                      attributeName="opacity"
                      values="0.3;1;0.3"
                      dur="0.12s"
                      repeatCount="indefinite"
                    />
                  </line>
                )}
                <text textAnchor="middle" dominantBaseline="central" fontSize="28">
                  🚁
                </text>
              </>
            )}
          </g>
        )}

        {waiting && (
          <>
            <text
              x={PAD.left + 18}
              y={PAD.top + plotH - 2}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize="24"
            >
              🚁
            </text>
            <text
              x={W / 2}
              y={H / 2}
              textAnchor="middle"
              fill="#8b82a3"
              fontSize="14"
              fontWeight="600"
              fontFamily="system-ui, sans-serif"
            >
              Aguardando decolagem...
            </text>
          </>
        )}
      </svg>
    </div>
  );
}
