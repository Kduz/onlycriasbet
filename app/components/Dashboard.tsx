'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ChevronRight,
  Gamepad2,
  Home,
  LogOut,
  Shield,
  User,
  Users,
} from 'lucide-react';
import AviatorGame from './AviatorGame';
import RouletteGame from './RouletteGame';
import MinesGame from './MinesGame';
import BlackjackGame from './BlackjackGame';
import MemoryGame from './MemoryGame';
import TigerSlotGame from './TigerSlotGame';
import AdminPanel from './AdminPanel';
import AffiliateTab from './AffiliateTab';
import RichLeaderboard from './RichLeaderboard';
import GameToastProvider from './GameToastProvider';
import type { AffiliateProfile } from '../lib/affiliate';
import { isHouseEmail } from '../lib/house-bank';
import { FantasyBanner, FantasyFrame, GemIcon } from './FantasyDecor';

export type ProfileUser = {
  id: string;
  email?: string | null;
};

type TabId = 'home' | 'games' | 'affiliates' | 'account' | 'admin';

type DashboardProps = {
  user: ProfileUser;
  balance: number;
  onBalanceChange: (balance: number) => void;
  onLogout: () => void;
  updateBalance: (userId: string, balance: number) => Promise<{ error: Error | null }>;
  affiliate: AffiliateProfile | null;
  affiliateLoading: boolean;
  onRefreshAffiliate: () => Promise<void>;
  onRefreshBalance?: () => void;
};

const GAMES = [
  {
    id: 'aviator-oliver-tree',
    name: 'Aviator',
    fullName: 'Aviator do Oliver Tree',
    description: 'Saque antes do crash',
    emoji: '🚁',
    tag: 'Ao vivo',
    accent: 'aviator',
    available: true,
  },
  {
    id: 'roulette-crias',
    name: 'Roleta',
    fullName: 'Roleta dos Crias',
    description: 'Vermelho, preto ou número',
    emoji: '🎰',
    tag: 'Ao vivo',
    accent: 'roulette',
    available: true,
  },
  {
    id: 'mines-minecraft',
    name: 'Mines',
    fullName: 'Mines do Minecraft',
    description: 'Mais diamantes leva o pot',
    emoji: '⛏',
    tag: 'Ao vivo',
    accent: 'mines',
    available: true,
  },
  {
    id: 'blackjack-21',
    name: '21',
    fullName: '21 dos Crias',
    description: 'Blackjack solo · 3:2',
    emoji: '🂡',
    tag: 'Solo',
    accent: 'bj',
    available: true,
  },
  {
    id: 'memory-pairs',
    name: 'Memoria',
    fullName: 'Memoria dos Crias',
    description: 'Ache os pares de imagens · 2x',
    emoji: '🃏',
    tag: 'Solo',
    accent: 'memory',
    available: true,
  },
  {
    id: 'tigrinho-slot',
    name: 'Tigrinho',
    fullName: 'Tigrinho dos Crias',
    description: 'Imagens caem · fileiras e diagonais',
    emoji: '🐯',
    tag: 'Solo',
    accent: 'tiger',
    available: true,
  },
] as const;

function formatKz(n: number) {
  return `${Math.floor(n).toLocaleString('pt-BR')} Kz`;
}

export default function Dashboard({
  user,
  balance,
  onBalanceChange,
  onLogout,
  updateBalance,
  affiliate,
  affiliateLoading,
  onRefreshAffiliate,
  onRefreshBalance,
}: DashboardProps) {
  const [tab, setTab] = useState<TabId>('home');
  const [activeGame, setActiveGame] = useState<string | null>(null);
  const isAdmin = isHouseEmail(user.email);
  const inGame = Boolean(activeGame);

  const openGames = () => {
    setActiveGame(null);
    setTab('games');
  };

  const selectTab = (id: TabId) => {
    setTab(id);
    setActiveGame(null);
  };

  const playGame = (id: string) => {
    setTab('games');
    setActiveGame(id);
  };

  const firstName = useMemo(() => {
    const raw = user.email?.split('@')[0] ?? 'cria';
    return raw.length > 14 ? `${raw.slice(0, 13)}…` : raw;
  }, [user.email]);

  const tabTitle =
    tab === 'home'
      ? 'Início'
      : tab === 'games'
        ? activeGame === 'roulette-crias'
          ? 'Roleta'
          : activeGame === 'mines-minecraft'
            ? 'Mines'
            : activeGame === 'blackjack-21'
              ? '21'
              : activeGame === 'memory-pairs'
                ? 'Memoria'
                : activeGame === 'tigrinho-slot'
                  ? 'Tigrinho'
                  : activeGame === 'aviator-oliver-tree'
                    ? 'Aviator'
                    : 'Jogos'
        : tab === 'affiliates'
          ? 'Afiliados'
          : tab === 'admin'
            ? 'Banca'
            : 'Conta';

  const bottomNav: { id: TabId; label: string; icon: typeof Home }[] = [
    { id: 'home', label: 'Início', icon: Home },
    { id: 'games', label: 'Jogos', icon: Gamepad2 },
    { id: 'affiliates', label: 'Afiliados', icon: Users },
    { id: 'account', label: 'Conta', icon: User },
  ];

  // Scroll to top when changing section
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [tab, activeGame]);

  return (
    <GameToastProvider userId={user.id} userEmail={user.email}>
      <div className={`app-shell ${inGame ? 'app-shell-ingame' : ''}`}>
        {/* Top bar — limpa */}
        <header className="app-topbar">
          <div className="app-topbar-brand min-w-0">
            <span className="app-logo" aria-hidden>
              ₵
            </span>
            <div className="min-w-0">
              <p className="app-brand-name">Cria&apos;s Bet</p>
              <p className="app-brand-sub">{tabTitle}</p>
            </div>
          </div>
          <div className="balance-pill" title="Seu saldo">
            <GemIcon kind="blue" size={22} />
            <strong>{formatKz(balance)}</strong>
          </div>
        </header>

        {/* Conteúdo */}
        <main
          className={`app-main ${
            tab === 'games' && activeGame
              ? 'app-main-game'
              : tab === 'admin'
                ? 'app-main-wide'
                : tab === 'home'
                  ? 'app-main-wide'
                  : 'app-main-default'
          }`}
        >
          {tab === 'home' && (
            <HomeTab
              balance={balance}
              firstName={firstName}
              userId={user.id}
              affiliateCode={affiliate?.affiliateCode}
              isAdmin={isAdmin}
              onPlayGame={playGame}
              onOpenGames={() => selectTab('games')}
              onOpenAffiliates={() => selectTab('affiliates')}
              onOpenAdmin={() => selectTab('admin')}
            />
          )}

          {tab === 'games' && !activeGame && <GamesTab onSelectGame={playGame} />}

          {tab === 'games' && activeGame === 'aviator-oliver-tree' && (
            <AviatorGame
              user={user}
              balance={balance}
              onBalanceChange={onBalanceChange}
              onBack={openGames}
              updateBalance={updateBalance}
            />
          )}

          {tab === 'games' && activeGame === 'roulette-crias' && (
            <RouletteGame
              user={user}
              balance={balance}
              onBalanceChange={onBalanceChange}
              onBack={openGames}
              updateBalance={updateBalance}
            />
          )}

          {tab === 'games' && activeGame === 'mines-minecraft' && (
            <MinesGame
              user={user}
              balance={balance}
              onBalanceChange={onBalanceChange}
              onBack={openGames}
              updateBalance={updateBalance}
            />
          )}

          {tab === 'games' && activeGame === 'blackjack-21' && (
            <BlackjackGame
              user={user}
              balance={balance}
              onBalanceChange={onBalanceChange}
              onBack={openGames}
              updateBalance={updateBalance}
            />
          )}

          {tab === 'games' && activeGame === 'memory-pairs' && (
            <MemoryGame
              user={user}
              balance={balance}
              onBalanceChange={onBalanceChange}
              onBack={openGames}
              updateBalance={updateBalance}
            />
          )}

          {tab === 'games' && activeGame === 'tigrinho-slot' && (
            <TigerSlotGame
              user={user}
              balance={balance}
              onBalanceChange={onBalanceChange}
              onBack={openGames}
              updateBalance={updateBalance}
            />
          )}

          {tab === 'affiliates' && (
            <AffiliateTab
              userId={user.id}
              profile={affiliate}
              loading={affiliateLoading}
              onRefresh={onRefreshAffiliate}
            />
          )}

          {tab === 'admin' && isAdmin && (
            <AdminPanel
              balance={balance}
              onBack={() => selectTab('home')}
              onBalanceRefresh={onRefreshBalance}
            />
          )}

          {tab === 'account' && (
            <AccountTab
              user={user}
              balance={balance}
              affiliate={affiliate}
              isAdmin={isAdmin}
              onLogout={onLogout}
              onOpenAffiliates={() => selectTab('affiliates')}
              onOpenAdmin={() => selectTab('admin')}
            />
          )}
        </main>

        {/* Bottom nav — esconde dentro do jogo pra dar espaço */}
        {!inGame && (
          <nav className="bottom-nav" aria-label="Navegação principal">
            {bottomNav.map(({ id, label, icon: Icon }) => {
              const active = tab === id || (id === 'games' && tab === 'games');
              return (
                <button
                  key={id}
                  type="button"
                  className={`bottom-nav-item ${active ? 'is-active' : ''}`}
                  onClick={() => selectTab(id)}
                  aria-current={active ? 'page' : undefined}
                >
                  <Icon size={22} strokeWidth={active ? 2.4 : 2} />
                  <span>{label}</span>
                </button>
              );
            })}
            {isAdmin && (
              <button
                type="button"
                className={`bottom-nav-item ${tab === 'admin' ? 'is-active admin' : ''}`}
                onClick={() => selectTab('admin')}
                aria-current={tab === 'admin' ? 'page' : undefined}
              >
                <Shield size={22} strokeWidth={tab === 'admin' ? 2.4 : 2} />
                <span>Banca</span>
              </button>
            )}
          </nav>
        )}
      </div>
    </GameToastProvider>
  );
}

function HomeTab({
  balance,
  firstName,
  userId,
  affiliateCode,
  isAdmin,
  onPlayGame,
  onOpenGames,
  onOpenAffiliates,
  onOpenAdmin,
}: {
  balance: number;
  firstName: string;
  userId: string;
  affiliateCode?: string;
  isAdmin?: boolean;
  onPlayGame: (id: string) => void;
  onOpenGames: () => void;
  onOpenAffiliates: () => void;
  onOpenAdmin?: () => void;
}) {
  return (
    <div className="home-page">
      <FantasyBanner title="Cria's Bet" subtitle={`Olá, ${firstName}`} />

      <FantasyFrame gemTop className="home-balance-frame">
        <div className="home-balance-row">
          <div>
            <p className="section-label">Teu saldo</p>
            <p className="home-balance-value home-balance-inline">
              <GemIcon kind="blue" size={32} />
              {formatKz(balance)}
            </p>
          </div>
          {isAdmin && onOpenAdmin && (
            <button type="button" onClick={onOpenAdmin} className="btn btn-ghost btn-sm">
              <Shield size={16} /> Banca
            </button>
          )}
        </div>
      </FantasyFrame>

      <section className="home-section">
        <div className="home-section-head">
          <h2 className="home-section-gold">Jogar</h2>
          <button type="button" onClick={onOpenGames} className="home-link">
            Ver todos
          </button>
        </div>
        <div className="game-grid">
          {GAMES.map((game) => (
            <button
              key={game.id}
              type="button"
              className={`game-tile accent-${game.accent}`}
              onClick={() => onPlayGame(game.id)}
            >
              <span className="game-tile-emoji" aria-hidden>
                {game.emoji}
              </span>
              <span className="game-tile-name">{game.name}</span>
              <span className="game-tile-desc">{game.description}</span>
              <span
                className={`game-tile-tag ${game.tag === 'Solo' ? 'solo' : 'live'}`}
              >
                {game.tag}
              </span>
            </button>
          ))}
        </div>
      </section>

      <FantasyFrame compact>
        <button type="button" onClick={onOpenAffiliates} className="home-quick-inner">
          <GemIcon kind="purple" size={28} />
          <div className="min-w-0 text-left">
            <p className="home-quick-title">Afiliados</p>
            <p className="home-quick-sub mono truncate">
              {affiliateCode ?? 'Gera teu código'}
            </p>
          </div>
          <ChevronRight size={16} className="text-[var(--muted)] shrink-0" />
        </button>
      </FantasyFrame>

      <section className="home-section">
        <div className="home-section-head">
          <h2 className="home-section-gold">Ranking</h2>
        </div>
        <FantasyFrame>
          <div className="home-rank-wrap">
            <RichLeaderboard currentUserId={userId} limit={8} compact />
          </div>
        </FantasyFrame>
      </section>

      <p className="home-footer">
        <AlertTriangle size={12} />
        Sátira · sem dinheiro real
      </p>
    </div>
  );
}

function GamesTab({ onSelectGame }: { onSelectGame: (id: string) => void }) {
  return (
    <div className="games-page">
      <FantasyBanner title="Jogos" subtitle="Escolhe um e boa sorte" />

      <div className="game-catalog">
        {GAMES.map((game) => (
          <FantasyFrame key={game.id} compact>
            <button
              type="button"
              disabled={!game.available}
              onClick={() => game.available && onSelectGame(game.id)}
              className={`game-catalog-card-inner accent-${game.accent} ${
                game.available ? '' : 'is-disabled'
              }`}
            >
              <span className="game-catalog-emoji" aria-hidden>
                {game.emoji}
              </span>
              <div className="game-catalog-body">
                <div className="game-catalog-title-row">
                  <h2>{game.fullName}</h2>
                  <span className={`badge ${game.tag === 'Solo' ? 'badge-info' : 'badge-live'}`}>
                    {game.tag}
                  </span>
                </div>
                <p>{game.description}</p>
              </div>
              <ChevronRight className="game-catalog-chevron" size={20} />
            </button>
          </FantasyFrame>
        ))}
      </div>
    </div>
  );
}

function AccountTab({
  user,
  balance,
  affiliate,
  isAdmin,
  onLogout,
  onOpenAffiliates,
  onOpenAdmin,
}: {
  user: ProfileUser;
  balance: number;
  affiliate: AffiliateProfile | null;
  isAdmin?: boolean;
  onLogout: () => void;
  onOpenAffiliates: () => void;
  onOpenAdmin?: () => void;
}) {
  return (
    <div className="account-page">
      <FantasyBanner title="Conta" subtitle="Perfil e saldo" />

      <FantasyFrame gemTop>
        <div className="account-hero">
          <div className="account-avatar" aria-hidden>
            {(user.email?.[0] ?? 'C').toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="account-email truncate">{user.email ?? '—'}</p>
            {isAdmin ? (
              <p className="account-role">Conta da banca · admin</p>
            ) : (
              <p className="account-role">Jogador</p>
            )}
          </div>
        </div>

        <div className="account-balance-block mt-3">
          <p className="section-label">{isAdmin ? 'Cofre da banca' : 'Seu saldo'}</p>
          <p className="account-balance-num">
            <GemIcon kind="blue" size={36} /> {formatKz(balance)}
          </p>
        </div>

        <div className="account-list mt-3">
          {affiliate?.affiliateCode && (
            <div className="account-row">
              <span className="section-label">Código de afiliado</span>
              <span className="mono tracking-wider text-[var(--gold-bright)] font-semibold">
                {affiliate.affiliateCode}
              </span>
            </div>
          )}
          <div className="account-row">
            <span className="section-label">ID</span>
            <span className="account-id mono">{user.id.slice(0, 8)}…</span>
          </div>
        </div>
      </FantasyFrame>

      <div className="account-actions">
        {isAdmin && onOpenAdmin && (
          <button type="button" onClick={onOpenAdmin} className="btn btn-purple w-full">
            <Shield size={18} /> Painel da banca
          </button>
        )}
        <button type="button" onClick={onOpenAffiliates} className="btn btn-ghost w-full">
          <Users size={18} /> Programa de afiliados
        </button>
        <button type="button" onClick={onLogout} className="btn btn-danger-outline w-full">
          <LogOut size={18} /> Sair da conta
        </button>
      </div>
    </div>
  );
}
