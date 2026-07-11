'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  ArrowLeft,
  Building2,
  Coins,
  Loader2,
  RefreshCw,
  Shield,
  TrendingDown,
  Users,
  Wallet,
} from 'lucide-react';
import {
  adminCreditPlayer,
  fetchAdminDashboard,
  HOUSE_BANK_EMAIL,
  type AdminDashboard,
} from '../lib/house-bank';
import { maskPlayerLabel } from '../lib/game-feed';

type AdminPanelProps = {
  balance: number;
  onBack?: () => void;
  onBalanceRefresh?: () => void;
};

function formatKz(n: number) {
  return `${Math.floor(n).toLocaleString('pt-BR')} Kz`;
}

function formatWhen(iso: string) {
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function gameLabel(game?: string | null) {
  switch (game) {
    case 'aviator':
      return 'Aviator';
    case 'roulette':
      return 'Roleta';
    case 'mines':
      return 'Mines';
    case 'blackjack':
      return '21';
    case 'tigrinho':
      return 'Tigrinho';
    case 'memory':
      return 'Memoria';
    case 'admin_grant':
      return 'Credito admin';
    default:
      return game || '—';
  }
}

const CREDIT_PRESETS = [10, 50, 100, 500, 1000];

export default function AdminPanel({ balance, onBack, onBalanceRefresh }: AdminPanelProps) {
  const [data, setData] = useState<AdminDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [creditEmail, setCreditEmail] = useState('');
  const [creditAmount, setCreditAmount] = useState(50);
  const [creditLoading, setCreditLoading] = useState(false);
  const [creditMsg, setCreditMsg] = useState<string | null>(null);
  const [creditErr, setCreditErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    const dash = await fetchAdminDashboard();
    if (!dash.ok) {
      setErrorMsg(dash.error || 'Sem permissão de admin');
      setData(null);
    } else {
      setData(dash);
    }
    setLoading(false);
    onBalanceRefresh?.();
  }, [onBalanceRefresh]);

  useEffect(() => {
    void load();
  }, [load]);

  const onCredit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreditMsg(null);
    setCreditErr(null);
    setCreditLoading(true);
    const res = await adminCreditPlayer(creditEmail, creditAmount);
    setCreditLoading(false);
    if (!res.ok) {
      setCreditErr(res.error);
      return;
    }
    setCreditMsg(
      `+${formatKz(res.amount)} para ${res.email} · novo saldo ${formatKz(res.new_balance)}`
    );
    setCreditAmount(50);
    void load();
  };

  const fillEmail = (email: string | null | undefined) => {
    if (!email) return;
    setCreditEmail(email);
    setCreditMsg(null);
    setCreditErr(null);
  };

  return (
    <div className="admin-page">
      <header className="admin-header">
        <div className="admin-header-left">
          {onBack && (
            <button type="button" onClick={onBack} className="admin-back">
              <ArrowLeft size={18} />
              <span>Voltar</span>
            </button>
          )}
          <div>
            <h1 className="admin-title">
              <Shield size={22} className="text-amber-300" />
              Painel da Banca
            </h1>
            <p className="admin-subtitle">{HOUSE_BANK_EMAIL}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="btn btn-ghost btn-sm"
          disabled={loading}
        >
          {loading ? <Loader2 className="animate-spin" size={16} /> : <RefreshCw size={16} />}
          Atualizar
        </button>
      </header>

      {errorMsg && (
        <div className="admin-alert danger">
          {errorMsg}
          <p className="mt-1 text-xs opacity-80">
            Rode <code>supabase/house-admin.sql</code> e{' '}
            <code>supabase/admin-credit-player.sql</code> no SQL Editor.
          </p>
        </div>
      )}

      {loading && !data ? (
        <div className="admin-loading">
          <Loader2 className="animate-spin text-purple-400" size={28} />
          <p>Carregando painel…</p>
        </div>
      ) : data ? (
        <>
          <div className="admin-stats">
            <div className="admin-stat house">
              <div className="admin-stat-icon">
                <Building2 size={20} />
              </div>
              <div>
                <p>Saldo da banca</p>
                <strong>{formatKz(data.house_balance || balance)}</strong>
              </div>
            </div>
            <div className="admin-stat">
              <div className="admin-stat-icon purple">
                <TrendingDown size={20} />
              </div>
              <div>
                <p>Total recebido (ledger)</p>
                <strong>{formatKz(data.ledger_total)}</strong>
              </div>
            </div>
            <div className="admin-stat">
              <div className="admin-stat-icon green">
                <Users size={20} />
              </div>
              <div>
                <p>Jogadores</p>
                <strong>{data.players_count}</strong>
              </div>
            </div>
            <div className="admin-stat">
              <div className="admin-stat-icon gold">
                <Wallet size={20} />
              </div>
              <div>
                <p>Saldo nos jogadores</p>
                <strong>{formatKz(data.players_total_balance)}</strong>
              </div>
            </div>
          </div>

          <p className="admin-hint">
            Todo valor que os jogadores perdem nos jogos é creditado automaticamente nesta conta.
            O teu saldo de login (<strong>{formatKz(balance)}</strong>) é o cofre da banca.
          </p>

          {/* Dar dinheiro */}
          <section className="admin-card admin-credit-card">
            <div className="admin-card-head">
              <h2>
                <Coins size={18} className="inline-block mr-1.5 align-text-bottom text-amber-300" />
                Dar dinheiro
              </h2>
              <span>por email</span>
            </div>
            <p className="admin-credit-help">
              Escreve o email da conta e o valor em Kz. O saldo do jogador sobe na hora.
            </p>
            <form onSubmit={onCredit} className="admin-credit-form">
              <div className="admin-credit-fields">
                <label className="admin-field">
                  <span>Email do jogador</span>
                  <input
                    type="email"
                    required
                    value={creditEmail}
                    onChange={(e) => setCreditEmail(e.target.value)}
                    placeholder="amigo@email.com"
                    className="input-field"
                    autoComplete="off"
                  />
                </label>
                <label className="admin-field">
                  <span>Valor (Kz)</span>
                  <input
                    type="number"
                    required
                    min={1}
                    max={1000000}
                    value={creditAmount}
                    onChange={(e) => setCreditAmount(Math.max(0, Number(e.target.value)))}
                    className="input-field admin-credit-amount"
                  />
                </label>
              </div>
              <div className="admin-credit-presets">
                {CREDIT_PRESETS.map((v) => (
                  <button
                    key={v}
                    type="button"
                    className={`chip ${creditAmount === v ? 'chip-active' : ''}`}
                    onClick={() => setCreditAmount(v)}
                  >
                    {v}
                  </button>
                ))}
              </div>
              <button
                type="submit"
                className="btn btn-purple w-full"
                disabled={creditLoading || !creditEmail.trim() || creditAmount < 1}
              >
                {creditLoading ? (
                  <Loader2 className="animate-spin" size={18} />
                ) : (
                  `Adicionar ${formatKz(creditAmount)}`
                )}
              </button>
            </form>
            {creditMsg && <div className="admin-alert ok mt-3">{creditMsg}</div>}
            {creditErr && (
              <div className="admin-alert danger mt-3">
                {creditErr}
                {creditErr.includes('function') || creditErr.includes('Could not find') ? (
                  <p className="mt-1 text-xs opacity-80">
                    Rode no Supabase SQL Editor: <code>supabase/admin-credit-player.sql</code>
                  </p>
                ) : null}
              </div>
            )}
          </section>

          <div className="admin-grid">
            <section className="admin-card">
              <div className="admin-card-head">
                <h2>Entradas recentes</h2>
                <span>{data.ledger.length} registos</span>
              </div>
              {data.ledger.length === 0 ? (
                <p className="admin-empty">Ainda não entrou nada. Quando alguém perder, aparece aqui.</p>
              ) : (
                <ul className="admin-ledger">
                  {data.ledger.map((row) => (
                    <li key={row.id}>
                      <div className="admin-ledger-main">
                        <span className="admin-ledger-amt">+{formatKz(row.amount)}</span>
                        <span className="admin-ledger-game">{gameLabel(row.game)}</span>
                      </div>
                      <div className="admin-ledger-meta">
                        <span>{maskPlayerLabel(row.from_email)}</span>
                        {row.detail && <span className="muted"> · {row.detail}</span>}
                        <span className="admin-ledger-time">{formatWhen(row.created_at)}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="admin-card">
              <div className="admin-card-head">
                <h2>Jogadores</h2>
                <span>toca p/ preencher email</span>
              </div>
              {data.players.length === 0 ? (
                <p className="admin-empty">Nenhum profile.</p>
              ) : (
                <ul className="admin-players">
                  {data.players.map((p, i) => (
                    <li
                      key={p.id}
                      className={`admin-player-row ${
                        p.is_house || p.is_admin ? 'is-house' : ''
                      }`}
                    >
                      <button
                        type="button"
                        className="admin-player-pick"
                        onClick={() => fillEmail(p.email)}
                        disabled={!p.email || !!p.is_house}
                        title={p.email ? `Creditar ${p.email}` : undefined}
                      >
                        <span className="admin-rank">#{i + 1}</span>
                        <span className="admin-player-mail truncate">
                          {p.is_house ? 'Banca' : p.email || maskPlayerLabel(p.email)}
                          {p.is_admin && !p.is_house ? ' · admin' : ''}
                        </span>
                        <span className="admin-player-bal">{formatKz(Number(p.balance))}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </>
      ) : null}
    </div>
  );
}
