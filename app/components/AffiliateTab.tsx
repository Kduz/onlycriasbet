'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, Check, Copy, Link2, Loader2, Users } from 'lucide-react';
import {
  AFFILIATE_COMMISSION_RATE,
  applyAffiliateCode,
  formatHistoryDate,
  getInviteLink,
  loadCommissionHistory,
  maskEmail,
  type AffiliateProfile,
  type CommissionHistoryItem,
} from '../lib/affiliate';

type AffiliateTabProps = {
  userId: string;
  profile: AffiliateProfile | null;
  loading: boolean;
  onRefresh: () => Promise<void>;
};

export default function AffiliateTab({
  userId,
  profile,
  loading,
  onRefresh,
}: AffiliateTabProps) {
  const [inputCode, setInputCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [copied, setCopied] = useState<'code' | 'link' | null>(null);
  const [history, setHistory] = useState<CommissionHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  const percent = Math.round(AFFILIATE_COMMISSION_RATE * 100);
  const inviteLink = profile ? getInviteLink(profile.affiliateCode) : '';

  useEffect(() => {
    let cancelled = false;
    setHistoryLoading(true);
    loadCommissionHistory(userId)
      .then((items) => {
        if (!cancelled) setHistory(items);
      })
      .finally(() => {
        if (!cancelled) setHistoryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, profile?.affiliateEarnings]);

  const copy = async (value: string, kind: 'code' | 'link') => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      setTimeout(() => setCopied(null), 1800);
    } catch {
      setMessage({ type: 'err', text: value });
    }
  };

  const handleApply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || busy) return;

    setBusy(true);
    setMessage(null);

    const result = await applyAffiliateCode(userId, profile.affiliateCode, inputCode);

    if (!result.ok) {
      setMessage({ type: 'err', text: result.error });
      setBusy(false);
      return;
    }

    setMessage({
      type: 'ok',
      text: `Código vinculado. O afiliado recebe ${percent}% dos seus ganhos.`,
    });
    setInputCode('');
    await onRefresh();
    setBusy(false);
  };

  if (loading || !profile) {
    return (
      <div className="py-16 flex flex-col items-center gap-3 text-[var(--text-secondary)]">
        <Loader2 className="animate-spin text-purple-400" size={26} />
        <p className="text-sm">Carregando afiliados...</p>
      </div>
    );
  }

  if (!profile.schemaReady) {
    return (
      <div className="space-y-5 max-w-xl">
        <header>
          <h1 className="page-title flex items-center gap-2">
            <Users size={26} className="text-purple-300" />
            Afiliados
          </h1>
          <p className="page-subtitle">Configuração necessária no Supabase</p>
        </header>
        <div className="surface p-5 space-y-4 border border-amber-500/40">
          <p className="text-amber-200 font-semibold">Schema de afiliados não instalado</p>
          <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
            {profile.setupError ||
              'As colunas e funções de afiliado ainda não existem no banco.'}
          </p>
          <ol className="text-sm text-[var(--text-secondary)] space-y-2 list-decimal pl-5">
            <li>
              Abra o{' '}
              <a
                className="text-purple-300 underline"
                href="https://supabase.com/dashboard"
                target="_blank"
                rel="noreferrer"
              >
                Supabase Dashboard
              </a>
            </li>
            <li>
              Vá em <strong>SQL Editor</strong>
            </li>
            <li>
              Cole e rode o arquivo{' '}
              <code className="text-purple-200">supabase/setup-affiliates.sql</code>
            </li>
            <li>Volte aqui e clique em atualizar</li>
          </ol>
          <button type="button" className="btn btn-purple w-full" onClick={() => onRefresh()}>
            Já rodei o SQL — atualizar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-xl">
      <header>
        <h1 className="page-title flex items-center gap-2">
          <Users size={26} className="text-purple-300" />
          Afiliados
        </h1>
        <p className="page-subtitle">
          Indique amigos e ganhe <strong className="text-[var(--success)]">{percent}%</strong> dos
          ganhos deles nos jogos.
        </p>
      </header>

      {/* Share */}
      <section className="surface p-4 sm:p-5 space-y-4">
        <div>
          <p className="section-label mb-2">Seu código</p>
          <div className="flex gap-2">
            <div className="flex-1 surface-2 px-4 py-3.5 text-center mono text-2xl tracking-[0.18em] font-bold text-purple-100">
              {profile.affiliateCode}
            </div>
            <button
              type="button"
              onClick={() => copy(profile.affiliateCode, 'code')}
              className="btn btn-purple btn-icon shrink-0"
              aria-label="Copiar código"
            >
              {copied === 'code' ? <Check size={20} /> : <Copy size={20} />}
            </button>
          </div>
        </div>

        <div>
          <p className="section-label mb-2 flex items-center gap-1.5">
            <Link2 size={12} /> Link de convite
          </p>
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="flex-1 surface-2 px-3 py-3 text-sm text-[var(--text-secondary)] break-all mono leading-relaxed">
              {inviteLink}
            </div>
            <button
              type="button"
              onClick={() => copy(inviteLink, 'link')}
              className="btn btn-ghost shrink-0"
            >
              {copied === 'link' ? (
                <>
                  <Check size={16} /> Copiado
                </>
              ) : (
                <>
                  <Copy size={16} /> Copiar link
                </>
              )}
            </button>
          </div>
          <p className="field-hint mt-2">
            Quem abrir o link já entra no cadastro com seu código.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="stat-box">
            <p className="section-label">Indicados</p>
            <p className="value">{profile.referralsCount}</p>
          </div>
          <div className="stat-box">
            <p className="section-label">Você ganhou</p>
            <p className="value success">{profile.affiliateEarnings} Kz</p>
          </div>
        </div>
      </section>

      {/* Bind */}
      <section className="surface p-4 sm:p-5 space-y-3">
        <div>
          <h2 className="font-semibold text-base">Usar código de alguém</h2>
          <p className="field-hint mt-1">
            Só uma vez. Não dá para usar o seu próprio código.
          </p>
        </div>

        {profile.referredBy ? (
          <div className="banner banner-success">
            Você está afiliado
            {profile.referredByCode ? (
              <>
                {' '}
                a <strong className="mono">{profile.referredByCode}</strong>
              </>
            ) : null}
            . Essa pessoa recebe {percent}% dos seus ganhos.
          </div>
        ) : (
          <form onSubmit={handleApply} className="space-y-3">
            <div className="field">
              <label htmlFor="affiliate-code" className="field-label">
                Código do afiliado
              </label>
              <input
                id="affiliate-code"
                type="text"
                value={inputCode}
                onChange={(e) => setInputCode(e.target.value.toUpperCase())}
                placeholder="Ex: AB12CD34"
                maxLength={12}
                className="input-field mono tracking-wider uppercase"
              />
            </div>
            <button
              type="submit"
              disabled={busy || !inputCode.trim()}
              className="btn btn-purple w-full"
            >
              {busy ? (
                <>
                  <Loader2 className="animate-spin" size={18} /> Salvando...
                </>
              ) : (
                'Vincular código'
              )}
            </button>
          </form>
        )}

        {message && (
          <div
            className={`banner ${message.type === 'ok' ? 'banner-success' : 'banner-danger'}`}
            role="status"
          >
            {message.text}
          </div>
        )}
      </section>

      {/* History */}
      <section className="surface p-4 sm:p-5">
        <h2 className="font-semibold text-base mb-1">Histórico de comissões</h2>
        <p className="field-hint mb-4">Quando um indicado saca no Aviator, aparece aqui.</p>

        {historyLoading ? (
          <div className="py-8 flex justify-center">
            <Loader2 className="animate-spin text-purple-400" size={22} />
          </div>
        ) : history.length === 0 ? (
          <div className="surface-2 px-4 py-8 text-center">
            <p className="text-sm text-[var(--text-secondary)]">
              Nenhuma comissão ainda. Compartilhe seu link para começar.
            </p>
          </div>
        ) : (
          <div className="max-h-72 overflow-y-auto -mx-1 px-1">
            {history.map((item) => (
              <div key={item.id} className="list-row">
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">{maskEmail(item.fromEmail)}</p>
                  <p className="text-xs text-[var(--muted)] mt-0.5">
                    Ganhou {item.winAmount} Kz · {formatHistoryDate(item.createdAt)}
                  </p>
                </div>
                <p className="text-[var(--success)] font-bold tabular-nums shrink-0">
                  +{item.commission} Kz
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="surface-2 p-4 text-sm text-[var(--text-secondary)] space-y-1.5 leading-relaxed">
        <p className="font-semibold text-[var(--text)]">Resumo rápido</p>
        <p>1. Compartilhe o link ou o código.</p>
        <p>2. O amigo se cadastra / vincula uma vez.</p>
        <p>3. Quando ele saca no Aviator, você leva {percent}%.</p>
      </section>

      <p className="text-center text-xs text-[var(--muted)] flex items-center justify-center gap-1.5">
        <AlertTriangle size={12} className="text-[var(--danger)]" />
        Comissões em Kz fictícios
      </p>
    </div>
  );
}
