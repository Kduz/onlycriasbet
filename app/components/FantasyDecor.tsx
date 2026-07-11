'use client';

import type { ReactNode } from 'react';

type FantasyFrameProps = {
  children: ReactNode;
  className?: string;
  compact?: boolean;
  /** Pequena gema CSS no topo (sem imagem esticada) */
  gemTop?: boolean;
};

/**
 * Painel fantasy só com CSS — sem imagens esticadas.
 * Moldura dourada + painel verde + cantos em filigrana.
 */
export function FantasyFrame({
  children,
  className = '',
  compact = false,
  gemTop = false,
}: FantasyFrameProps) {
  return (
    <div className={`fx-panel ${compact ? 'fx-panel-sm' : ''} ${className}`}>
      <span className="fx-panel-edge" aria-hidden />
      <span className="fx-corner-mark tl" aria-hidden />
      <span className="fx-corner-mark tr" aria-hidden />
      <span className="fx-corner-mark bl" aria-hidden />
      <span className="fx-corner-mark br" aria-hidden />
      {gemTop && <span className="fx-gem-dot" aria-hidden />}
      <div className="fx-panel-body">{children}</div>
    </div>
  );
}

type FantasyBannerProps = {
  title: string;
  subtitle?: string;
  className?: string;
};

/** Título em placa dourada (CSS puro). */
export function FantasyBanner({ title, subtitle, className = '' }: FantasyBannerProps) {
  return (
    <header className={`fx-title-plaque ${className}`}>
      <span className="fx-title-gem" aria-hidden />
      <h1 className="fx-title-text">{title}</h1>
      {subtitle ? <p className="fx-title-sub">{subtitle}</p> : null}
    </header>
  );
}

/** Gema decorativa em CSS (sem JPG). */
export function GemIcon({
  kind = 'blue',
  size = 22,
  className = '',
}: {
  kind?: 'blue' | 'purple' | 'gold';
  size?: number;
  className?: string;
}) {
  return (
    <span
      className={`fx-gem-css kind-${kind} ${className}`}
      style={{ width: size, height: size }}
      aria-hidden
    />
  );
}

/** Mantido por compatibilidade — não usa mais assets esticados. */
export const UI = {
  frame: '',
  frameAlt: '',
  banner: '',
  gemBlue: '',
  gemBlueAlt: '',
  gemPurple: '',
  corners: '',
  help: '',
} as const;

export function CornerDecor() {
  return null;
}
