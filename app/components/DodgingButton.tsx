'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type MouseEvent,
  type ReactNode,
} from 'react';

type DodgingButtonProps = {
  /** Quando true (aposta ativa / pode parar), rola a chance de desviar. */
  active: boolean;
  /** Chance de o botão virar "fugitivo" nesta rodada (default 7.5%). */
  dodgeChance?: number;
  children: ReactNode;
  className?: string;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className' | 'children'>;

/**
 * Botão de parar/sacar reutilizável.
 * Em cada momento em que `active` vira true, rola dodgeChance (7.5%):
 * se cair, o botão foge do mouse até a ação acabar.
 */
export default function DodgingButton({
  active,
  dodgeChance = 0.075,
  children,
  className = '',
  disabled,
  onClick,
  ...rest
}: DodgingButtonProps) {
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dodging, setDodging] = useState(false);
  const rolledRef = useRef(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!active) {
      rolledRef.current = false;
      setDodging(false);
      setOffset({ x: 0, y: 0 });
      return;
    }

    if (!rolledRef.current) {
      rolledRef.current = true;
      const hit = Math.random() < dodgeChance;
      setDodging(hit);
      if (!hit) setOffset({ x: 0, y: 0 });
    }
  }, [active, dodgeChance]);

  const flee = useCallback(
    (clientX: number, clientY: number) => {
      if (!dodging || !active || disabled) return;
      const wrap = wrapRef.current;
      if (!wrap) return;

      const rect = wrap.getBoundingClientRect();
      const cx = rect.left + rect.width / 2 + offset.x;
      const cy = rect.top + rect.height / 2 + offset.y;
      const dx = clientX - cx;
      const dy = clientY - cy;
      const dist = Math.hypot(dx, dy) || 1;

      // Empurra para longe do cursor + ruído
      const push = 70 + Math.random() * 50;
      let nx = offset.x - (dx / dist) * push + (Math.random() - 0.5) * 40;
      let ny = offset.y - (dy / dist) * push + (Math.random() - 0.5) * 30;

      // Limites relativos à área do wrapper (não some da tela)
      const maxX = Math.min(140, window.innerWidth * 0.28);
      const maxY = Math.min(90, window.innerHeight * 0.18);
      nx = Math.max(-maxX, Math.min(maxX, nx));
      ny = Math.max(-maxY, Math.min(maxY, ny));

      setOffset({ x: nx, y: ny });
    },
    [dodging, active, disabled, offset.x, offset.y]
  );

  const onMove = (e: MouseEvent) => {
    if (!dodging) return;
    flee(e.clientX, e.clientY);
  };

  const onEnter = (e: MouseEvent) => {
    if (!dodging) return;
    flee(e.clientX, e.clientY);
  };

  return (
    <div
      ref={wrapRef}
      className={`dodging-wrap ${dodging ? 'is-dodging' : ''}`}
      onMouseMove={onMove}
      onMouseEnter={onEnter}
    >
      <button
        type="button"
        disabled={disabled || !active}
        onClick={onClick}
        className={`dodging-btn ${className}`}
        style={{
          transform: `translate(${offset.x}px, ${offset.y}px)`,
        }}
        {...rest}
      >
        {children}
      </button>
      {dodging && active && !disabled && (
        <span className="dodging-hint" aria-hidden>
          😈 o botão está travesso
        </span>
      )}
    </div>
  );
}
