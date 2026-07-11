'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Crown, Loader2, RefreshCw, Trophy } from 'lucide-react';
import { supabase } from '../lib/supabase';

export type RichEntry = {
  id: string;
  email: string | null;
  balance: number;
};

type RichLeaderboardProps = {
  currentUserId?: string;
  limit?: number;
  compact?: boolean;
};

function maskEmail(email: string | null) {
  if (!email) return 'Jogador';
  const [user, domain] = email.split('@');
  if (!domain) return email;
  return `${user.slice(0, 2)}***@${domain}`;
}

function rankStyle(rank: number) {
  if (rank === 1) return 'rank-gold';
  if (rank === 2) return 'rank-silver';
  if (rank === 3) return 'rank-bronze';
  return 'rank-default';
}

function sameRows(a: RichEntry[], b: RichEntry[]) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].id !== b[i].id || a[i].balance !== b[i].balance) return false;
  }
  return true;
}

function mapRows(data: unknown[]): RichEntry[] {
  return data.map((raw) => {
    const r = raw as Record<string, unknown>;
    return {
      id: String(r.id ?? ''),
      email: (r.email as string | null) ?? null,
      balance: Number(r.balance ?? 0),
    };
  }).filter((r) => r.id);
}

export default function RichLeaderboard({
  currentUserId,
  limit = 10,
  compact = false,
}: RichLeaderboardProps) {
  const [rows, setRows] = useState<RichEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const busyRef = useRef(false);

  const load = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;

    try {
      setErrorMsg(null);

      // 1) RPC security definer (funciona mesmo com RLS restrito)
      const rpc = await supabase.rpc('get_richest_players', { p_limit: limit });

      if (!rpc.error && Array.isArray(rpc.data) && rpc.data.length > 0) {
        const next = mapRows(rpc.data);
        setRows((prev) => (sameRows(prev, next) ? prev : next));
        setUpdatedAt(new Date());
        return;
      }

      // 2) Fallback: select direto na tabela
      const { data, error } = await supabase
        .from('profiles')
        .select('id, email, balance')
        .order('balance', { ascending: false })
        .limit(limit);

      if (error) {
        setErrorMsg(error.message);
        return;
      }

      if (data && data.length > 0) {
        const next = mapRows(data);
        setRows((prev) => (sameRows(prev, next) ? prev : next));
        setUpdatedAt(new Date());
        return;
      }

      // Vazio de verdade OU RLS bloqueando (retorna [] sem erro)
      if (rpc.error) {
        setErrorMsg(
          'Ranking bloqueado pelo banco. Rode o SQL em supabase/affiliate-schema.sql (função get_richest_players).'
        );
      } else {
        setRows([]);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Erro ao carregar ranking');
    } finally {
      setLoading(false);
      busyRef.current = false;
    }
  }, [limit]);

  useEffect(() => {
    let alive = true;

    const tick = () => {
      if (alive) void load();
    };

    tick();
    const id = window.setInterval(tick, 6000);

    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [load]);

  return (
    <section className={`rich-board ${compact ? 'is-compact' : ''}`}>
      <div className="rich-board-head">
        <div className="flex items-center gap-2 min-w-0">
          <span className="rich-board-icon">
            <Trophy size={compact ? 16 : 18} />
          </span>
          <div className="min-w-0">
            <h2 className={`font-bold ${compact ? 'text-sm' : 'text-base'}`}>Mais ricos</h2>
            <p className="text-[11px] text-[var(--muted)] leading-tight">
              Top {limit} · atualiza sozinho
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="badge badge-live">Live</span>
          <button
            type="button"
            onClick={() => load()}
            className="rich-refresh"
            aria-label="Atualizar ranking"
            title="Atualizar"
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {loading && rows.length === 0 ? (
        <div className="py-8 flex justify-center text-purple-300">
          <Loader2 className="animate-spin" size={22} />
        </div>
      ) : errorMsg && rows.length === 0 ? (
        <div className="py-5 px-3 text-center space-y-2">
          <p className="text-sm text-red-300/90 leading-relaxed">{errorMsg}</p>
          <p className="text-xs text-[var(--muted)]">
            No Supabase → SQL Editor, execute o arquivo{' '}
            <span className="text-purple-300">supabase/affiliate-schema.sql</span>
          </p>
        </div>
      ) : rows.length === 0 ? (
        <div className="py-6 px-3 text-center text-sm text-[var(--muted)]">
          Nenhum jogador no ranking ainda.
        </div>
      ) : (
        <div className="rich-table-wrap">
          <table className="rich-table">
            <thead>
              <tr>
                <th className="col-rank">#</th>
                <th className="col-user">Jogador</th>
                <th className="col-bal">Saldo</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const rank = i + 1;
                const isMe = currentUserId === row.id;
                return (
                  <tr key={row.id} className={`${rankStyle(rank)} ${isMe ? 'is-me' : ''}`}>
                    <td className="col-rank">
                      <span className="rank-pill">
                        {rank <= 3 ? <Crown size={12} /> : null}
                        {rank}
                      </span>
                    </td>
                    <td className="col-user">
                      <span className="user-name">{maskEmail(row.email)}</span>
                      {isMe && <span className="you-tag">você</span>}
                    </td>
                    <td className="col-bal">
                      <span className="bal-value">{row.balance.toLocaleString('pt-BR')}</span>
                      <span className="bal-unit">Kz</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {updatedAt && rows.length > 0 && (
        <p className="rich-updated">
          Atualizado{' '}
          {updatedAt.toLocaleTimeString('pt-BR', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          })}
        </p>
      )}
    </section>
  );
}
