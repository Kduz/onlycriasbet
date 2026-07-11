'use client';

import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ChevronRight,
  Gamepad2,
  Home,
  LogOut,
  Menu,
  User,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import AviatorGame from './AviatorGame';
import RouletteGame from './RouletteGame';
import MinesGame from './MinesGame';
import AffiliateTab from './AffiliateTab';
import RichLeaderboard from './RichLeaderboard';
import GameToastProvider from './GameToastProvider';
import type { AffiliateProfile } from '../lib/affiliate';

export type ProfileUser = {
  id: string;
  email?: string | null;
};

type TabId = 'home' | 'games' | 'affiliates' | 'account';

type DashboardProps = {
  user: ProfileUser;
  balance: number;
  onBalanceChange: (balance: number) => void;
  onLogout: () => void;
  updateBalance: (userId: string, balance: number) => Promise<{ error: Error | null }>;
  affiliate: AffiliateProfile | null;
  affiliateLoading: boolean;
  onRefreshAffiliate: () => Promise<void>;
};

const GAMES = [
  {
    id: 'aviator-oliver-tree',
    name: 'Aviator do Oliver Tree',
    description: 'Aposte, veja o helicóptero subir e saque antes do crash.',
    emoji: '🚁',
    tag: 'Ao vivo',
    available: true,
  },
  {
    id: 'roulette-crias',
    name: 'Roleta dos Crias',
    description: 'Aposte em vermelho, preto, branco ou número.',
    emoji: '🎰',
    tag: 'Ao vivo',
    available: true,
  },
  {
    id: 'mines-minecraft',
    name: 'Mines do Minecraft',
    description: 'Quebre blocos · maior score leva o pot.',
    emoji: '⛏',
    tag: 'Ao vivo',
    available: true,
  },
] as const;

export default function Dashboard({
  user,
  balance,
  onBalanceChange,
  onLogout,
  updateBalance,
  affiliate,
  affiliateLoading,
  onRefreshAffiliate,
}: DashboardProps) {
  const [tab, setTab] = useState<TabId>('home');
  const [activeGame, setActiveGame] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const openGames = () => {
    setActiveGame(null);
    setTab('games');
  };

  const selectTab = (id: TabId) => {
    setTab(id);
    setActiveGame(null);
    setMenuOpen(false);
  };

  const playGame = (id: string) => {
    setTab('games');
    setActiveGame(id);
    setMenuOpen(false);
  };

  const playAviator = () => playGame('aviator-oliver-tree');

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  const navItems: { id: TabId; label: string; desc: string; icon: typeof Home }[] = [
    { id: 'home', label: 'Início', desc: 'Resumo e atalhos', icon: Home },
    { id: 'games', label: 'Jogos', desc: 'Aviator e mais', icon: Gamepad2 },
    { id: 'affiliates', label: 'Afiliados', desc: 'Código e comissões', icon: Users },
    { id: 'account', label: 'Conta', desc: 'Perfil e saldo', icon: User },
  ];

  const tabTitle =
    tab === 'home'
      ? 'Início'
      : tab === 'games'
        ? activeGame === 'roulette-crias'
          ? 'Roleta'
          : activeGame === 'mines-minecraft'
            ? 'Mines'
            : activeGame
              ? 'Aviator'
              : 'Jogos'
        : tab === 'affiliates'
          ? 'Afiliados'
          : 'Conta';

  return (
    <GameToastProvider userId={user.id} userEmail={user.email}>
    <div className="min-h-screen flex flex-col">
      {/* Top bar */}
      <header className="sticky top-0 z-40 topbar-shell px-3 sm:px-4 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            className="hamburger-btn"
            aria-label="Abrir menu"
            aria-expanded={menuOpen}
          >
            <Menu size={22} strokeWidth={2.25} />
          </button>
          <div className="min-w-0">
            <p className="text-base sm:text-lg font-extrabold text-gradient leading-none truncate">
              CRIA&apos;S BET
            </p>
            <p className="text-xs text-[var(--muted)] mt-0.5 hidden sm:block">{tabTitle}</p>
          </div>
        </div>

        <div className="balance-pill shrink-0" title="Seu saldo">
          <Wallet size={15} className="text-[var(--success)]" />
          <strong>{balance} Kz</strong>
        </div>
      </header>

      {/* Drawer menu */}
      <AnimatePresence>
        {menuOpen && (
          <>
            <motion.button
              type="button"
              aria-label="Fechar menu"
              className="drawer-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setMenuOpen(false)}
            />
            <motion.aside
              className="drawer-panel"
              role="dialog"
              aria-modal="true"
              aria-label="Menu"
              initial={{ x: '-105%' }}
              animate={{ x: 0 }}
              exit={{ x: '-105%' }}
              transition={{ type: 'spring', stiffness: 380, damping: 34 }}
            >
              <div className="drawer-header">
                <div>
                  <p className="text-xl font-extrabold text-gradient">CRIA&apos;S BET</p>
                  <p className="text-xs text-[var(--muted)] mt-1">Menu do jogador</p>
                </div>
                <button
                  type="button"
                  onClick={() => setMenuOpen(false)}
                  className="drawer-close"
                  aria-label="Fechar"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="drawer-balance">
                <p className="section-label flex items-center gap-1.5">
                  <Wallet size={12} /> Saldo atual
                </p>
                <p className="text-2xl font-bold text-[var(--success)] mt-1">{balance} Kz</p>
                {affiliate?.affiliateCode && (
                  <p className="text-xs text-[var(--muted)] mt-2 mono tracking-wider">
                    Código: {affiliate.affiliateCode}
                  </p>
                )}
              </div>

              <nav className="drawer-nav" aria-label="Menu principal">
                {navItems.map(({ id, label, desc, icon: Icon }) => {
                  const active = tab === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => selectTab(id)}
                      className={`drawer-link ${active ? 'drawer-link-active' : ''}`}
                    >
                      <span className={`drawer-link-icon ${active ? 'is-active' : ''}`}>
                        <Icon size={20} strokeWidth={2} />
                      </span>
                      <span className="min-w-0 flex-1 text-left">
                        <span className="block font-semibold text-[0.95rem]">{label}</span>
                        <span className="block text-xs text-[var(--muted)] mt-0.5">{desc}</span>
                      </span>
                      {active && <span className="drawer-dot" />}
                    </button>
                  );
                })}
              </nav>

              <div className="drawer-footer">
                <p className="text-xs text-[var(--muted)] truncate mb-3">{user.email}</p>
                <button type="button" onClick={onLogout} className="btn btn-danger-outline w-full">
                  <LogOut size={17} /> Sair da conta
                </button>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Content — largura maior no Aviator para caber gráfico + ranking */}
      <main
        className={`flex-1 px-3 sm:px-5 pb-8 w-full mx-auto ${
          tab === 'games' && activeGame === 'mines-minecraft'
            ? 'max-w-6xl pt-1 sm:pt-2'
            : tab === 'games' && activeGame
              ? 'max-w-6xl py-3 sm:py-4'
              : tab === 'home'
                ? 'max-w-5xl py-3 sm:py-4'
                : 'max-w-3xl py-3 sm:py-4'
        }`}
      >
        {tab === 'home' && (
          <HomeTab
            balance={balance}
            email={user.email}
            userId={user.id}
            affiliateCode={affiliate?.affiliateCode}
            onPlayAviator={playAviator}
            onOpenGames={() => selectTab('games')}
            onOpenAffiliates={() => selectTab('affiliates')}
            onOpenMenu={() => setMenuOpen(true)}
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

        {tab === 'affiliates' && (
          <AffiliateTab
            userId={user.id}
            profile={affiliate}
            loading={affiliateLoading}
            onRefresh={onRefreshAffiliate}
          />
        )}

        {tab === 'account' && (
          <AccountTab
            user={user}
            balance={balance}
            affiliate={affiliate}
            onLogout={onLogout}
            onOpenAffiliates={() => selectTab('affiliates')}
          />
        )}
      </main>
    </div>
    </GameToastProvider>
  );
}

function HomeTab({
  balance,
  email,
  userId,
  affiliateCode,
  onPlayAviator,
  onOpenGames,
  onOpenAffiliates,
  onOpenMenu,
}: {
  balance: number;
  email?: string | null;
  userId: string;
  affiliateCode?: string;
  onPlayAviator: () => void;
  onOpenGames: () => void;
  onOpenAffiliates: () => void;
  onOpenMenu: () => void;
}) {
  const firstName = email?.split('@')[0] ?? 'cria';

  return (
    <div className="space-y-4 sm:space-y-5">
      <header>
        <h1 className="page-title">Olá, {firstName}</h1>
        <p className="page-subtitle">
          Menu ☰ ·{' '}
          <button
            type="button"
            onClick={onOpenMenu}
            className="text-purple-300 font-semibold underline-offset-2 hover:underline"
          >
            abrir navegação
          </button>
        </p>
      </header>

      <div className="home-grid">
        <div className="space-y-4">
          <section className="surface p-4 sm:p-5 glow-purple">
            <div className="flex items-start gap-3">
              <div
                className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 text-xl"
                style={{ background: 'linear-gradient(135deg,#7c3aed,#db2777)' }}
              >
                🚁
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap mb-0.5">
                  <h2 className="text-base sm:text-lg font-bold">Aviator do Oliver Tree</h2>
                  <span className="badge badge-live">Ao vivo</span>
                </div>
                <p className="text-sm text-[var(--text-secondary)]">
                  Helicóptero no gráfico. Saque antes do crash.
                </p>
              </div>
            </div>
            <button type="button" onClick={onPlayAviator} className="btn btn-purple w-full mt-4">
              Jogar agora
            </button>
          </section>

          <section className="grid grid-cols-2 gap-3">
            <div className="stat-box">
              <p className="section-label">Saldo</p>
              <p className="value success text-xl sm:text-2xl">{balance} Kz</p>
            </div>
            <button
              type="button"
              onClick={onOpenAffiliates}
              className="stat-box text-left hover:border-[var(--border-strong)] transition"
            >
              <p className="section-label">Afiliados</p>
              <p className="value mono text-sm sm:text-base tracking-wide text-purple-200">
                {affiliateCode ?? '—'}
              </p>
            </button>
          </section>

          <button
            type="button"
            onClick={onOpenGames}
            className="w-full surface card-hover p-3.5 flex items-center gap-3 text-left"
          >
            <Gamepad2 className="text-purple-300 shrink-0" size={20} />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm">Catálogo de jogos</p>
              <p className="text-xs text-[var(--muted)]">Aviator e novidades</p>
            </div>
            <ChevronRight className="text-[var(--muted)] shrink-0" size={18} />
          </button>
        </div>

        <RichLeaderboard currentUserId={userId} limit={10} />
      </div>

      <p className="text-center text-xs text-[var(--muted)] flex items-center justify-center gap-1.5">
        <AlertTriangle size={12} className="text-[var(--danger)]" />
        Sátira · nada é real
      </p>
    </div>
  );
}

function GamesTab({ onSelectGame }: { onSelectGame: (id: string) => void }) {
  return (
    <div className="space-y-5">
      <header>
        <h1 className="page-title">Jogos</h1>
        <p className="page-subtitle">Escolha um jogo para começar</p>
      </header>

      <div className="space-y-3">
        {GAMES.map((game) => (
          <button
            key={game.id}
            type="button"
            disabled={!game.available}
            onClick={() => game.available && onSelectGame(game.id)}
            className={`w-full surface p-4 sm:p-5 text-left flex items-center gap-4 ${
              game.available ? 'card-hover cursor-pointer' : 'opacity-50 cursor-not-allowed'
            }`}
          >            <span className="text-3xl shrink-0 w-12 text-center" aria-hidden>
              {game.emoji}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap mb-0.5">
                <h2 className="font-bold text-base sm:text-lg">{game.name}</h2>
                <span className={`badge ${game.available ? 'badge-live' : 'badge-soon'}`}>
                  {game.tag}
                </span>
              </div>
              <p className="text-sm text-[var(--text-secondary)]">{game.description}</p>
            </div>
            {game.available && <ChevronRight className="text-purple-300 shrink-0" size={22} />}
          </button>
        ))}
      </div>
    </div>
  );
}

function AccountTab({
  user,
  balance,
  affiliate,
  onLogout,
  onOpenAffiliates,
}: {
  user: ProfileUser;
  balance: number;
  affiliate: AffiliateProfile | null;
  onLogout: () => void;
  onOpenAffiliates: () => void;
}) {
  return (
    <div className="space-y-5 max-w-lg">
      <header>
        <h1 className="page-title">Conta</h1>
        <p className="page-subtitle">Seus dados e saldo</p>
      </header>

      <div className="surface divide-y divide-[var(--border)] overflow-hidden">
        <div className="p-4 sm:p-5">
          <p className="section-label mb-1">Email</p>
          <p className="text-base font-medium break-all">{user.email ?? '—'}</p>
        </div>
        <div className="p-4 sm:p-5">
          <p className="section-label mb-1">Saldo</p>
          <p className="text-2xl font-bold text-[var(--success)]">{balance} Kz</p>
        </div>
        {affiliate?.affiliateCode && (
          <div className="p-4 sm:p-5">
            <p className="section-label mb-1">Código de afiliado</p>
            <p className="text-lg font-semibold mono tracking-wider text-purple-200">
              {affiliate.affiliateCode}
            </p>
          </div>
        )}
        <div className="p-4 sm:p-5">
          <p className="section-label mb-1">ID da conta</p>
          <p className="text-xs mono text-[var(--muted)] break-all leading-relaxed">{user.id}</p>
        </div>
      </div>

      <div className="space-y-2">
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
