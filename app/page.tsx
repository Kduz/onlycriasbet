'use client';

import { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { supabase } from './lib/supabase';
import {
  applyAffiliateCode,
  captureRefFromUrl,
  ensureAffiliateCode,
  loadAffiliateProfile,
  type AffiliateProfile,
} from './lib/affiliate';
import Dashboard, { type ProfileUser } from './components/Dashboard';
import { isHouseEmail, promoteHouseAccount } from './lib/house-bank';

export default function CriasBet() {
  const [user, setUser] = useState<ProfileUser | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [referralCode, setReferralCode] = useState('');
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [balance, setBalance] = useState(0);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [affiliate, setAffiliate] = useState<AffiliateProfile | null>(null);
  const [affiliateLoading, setAffiliateLoading] = useState(false);
  const [fromInvite, setFromInvite] = useState(false);

  const loadBalance = useCallback(async (userId: string) => {
    const { data } = await supabase.from('profiles').select('balance').eq('id', userId).single();
    if (data) setBalance(data.balance);
  }, []);

  const ensureHouseFlags = useCallback(async (email?: string | null) => {
    if (!isHouseEmail(email)) return;
    try {
      await promoteHouseAccount();
    } catch {
      /* SQL house-admin ainda não rodado */
    }
  }, []);

  const refreshAffiliate = useCallback(async (userId: string) => {
    setAffiliateLoading(true);
    try {
      const profile = await loadAffiliateProfile(userId);
      setAffiliate(profile);
    } catch (err) {
      console.error(err);
    } finally {
      setAffiliateLoading(false);
    }
  }, []);

  const updateBalance = useCallback(async (userId: string, newBalance: number) => {
    const { error } = await supabase.from('profiles').update({ balance: newBalance }).eq('id', userId);
    return { error: error ? new Error(error.message) : null };
  }, []);

  useEffect(() => {
    const ref = captureRefFromUrl();
    if (ref) {
      setReferralCode(ref);
      setFromInvite(true);
      setIsLogin(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return;
      if (session?.user) {
        setUser(session.user);
        loadBalance(session.user.id);
        refreshAffiliate(session.user.id);
        void ensureHouseFlags(session.user.email);
      }
      setSessionLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      // Evita re-fetch em todo TOKEN_REFRESHED (pode gerar churn desnecessário)
      if (event === 'TOKEN_REFRESHED') return;

      if (session?.user) {
        setUser(session.user);
        loadBalance(session.user.id);
        refreshAffiliate(session.user.id);
        void ensureHouseFlags(session.user.email);
      } else {
        setUser(null);
        setBalance(0);
        setAffiliate(null);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- monta uma vez
  }, []);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);

    try {
      if (isLogin) {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        setUser(data.user);
        await loadBalance(data.user.id);
        await refreshAffiliate(data.user.id);
        await ensureHouseFlags(data.user.email);
      } else {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        if (data.user) {
          const house = isHouseEmail(data.user.email);
          // Banca começa em 0; jogadores normais em 20 Kz
          const { error: profileErr } = await supabase.from('profiles').insert({
            id: data.user.id,
            email: data.user.email,
            balance: house ? 0 : 20,
            ...(house ? { is_admin: true, is_house: true } : {}),
          });
          if (profileErr) {
            // pode já existir por trigger
            console.warn(profileErr.message);
          }

          if (house) {
            await ensureHouseFlags(data.user.email);
            setUser(data.user);
            setBalance(0);
            await refreshAffiliate(data.user.id);
          } else {
            let ownCode = '';
            try {
              ownCode = await ensureAffiliateCode(data.user.id);
            } catch (e) {
              console.warn(e);
            }

            const ref = referralCode.trim().toUpperCase();
            if (ref && (!ownCode || ref !== ownCode)) {
              const linked = await applyAffiliateCode(
                data.user.id,
                ownCode || '--------',
                ref
              );
              if (!linked.ok) console.warn(linked.error);
            }

            setUser(data.user);
            setBalance(20);
            await refreshAffiliate(data.user.id);
          }
        }
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erro na autenticação';
      setErrorMsg(message);
    }

    setLoading(false);
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setBalance(0);
    setAffiliate(null);
  };

  if (sessionLoading) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <div className="flex flex-col items-center gap-3 text-[var(--text-secondary)]">
          <Loader2 className="animate-spin text-purple-400" size={28} />
          <p className="text-sm">Carregando...</p>
        </div>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="min-h-screen flex items-center justify-center p-5 sm:p-6">
        <div className="w-full max-w-[400px]">
          <header className="text-center mb-8">
            <h1 className="text-4xl sm:text-5xl font-extrabold text-gradient tracking-tight">
              CRIA&apos;S BET
            </h1>
            <p className="page-subtitle mt-2">Apostas satíricas · só diversão</p>
          </header>

          <div className="surface glow-purple p-6 sm:p-7">
            <div className="flex rounded-xl bg-[#0c0b12] p-1 mb-6 border border-[var(--border)]">
              <button
                type="button"
                className={`flex-1 min-h-11 rounded-lg text-sm font-semibold transition ${
                  isLogin
                    ? 'bg-[rgba(139,92,246,0.25)] text-white'
                    : 'text-[var(--muted)] hover:text-white'
                }`}
                onClick={() => {
                  setIsLogin(true);
                  setErrorMsg(null);
                }}
              >
                Entrar
              </button>
              <button
                type="button"
                className={`flex-1 min-h-11 rounded-lg text-sm font-semibold transition ${
                  !isLogin
                    ? 'bg-[rgba(139,92,246,0.25)] text-white'
                    : 'text-[var(--muted)] hover:text-white'
                }`}
                onClick={() => {
                  setIsLogin(false);
                  setErrorMsg(null);
                }}
              >
                Criar conta
              </button>
            </div>

            {fromInvite && !isLogin && referralCode && (
              <div className="banner banner-info mb-5">
                Convite detectado. Código:{' '}
                <strong className="mono tracking-wider">{referralCode}</strong>
              </div>
            )}

            {errorMsg && (
              <div className="banner banner-danger mb-5" role="alert">
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleAuth} className="space-y-4">
              <div className="field">
                <label htmlFor="email" className="field-label">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="voce@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input-field"
                  required
                />
              </div>

              <div className="field">
                <label htmlFor="password" className="field-label">
                  Senha
                </label>
                <input
                  id="password"
                  type="password"
                  autoComplete={isLogin ? 'current-password' : 'new-password'}
                  placeholder="Sua senha"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input-field"
                  required
                  minLength={6}
                />
              </div>

              {!isLogin && (
                <div className="field">
                  <label htmlFor="ref" className="field-label">
                    Código de afiliado{' '}
                    <span className="text-[var(--muted)] font-normal">(opcional)</span>
                  </label>
                  <input
                    id="ref"
                    type="text"
                    placeholder="Ex: AB12CD34"
                    value={referralCode}
                    onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
                    maxLength={12}
                    className="input-field mono tracking-wider uppercase"
                  />
                  <p className="field-hint">
                    Se alguém te convidou, cola o código aqui. Conta nova ganha 20 Kz.
                  </p>
                </div>
              )}

              <button type="submit" disabled={loading} className="btn btn-purple w-full mt-2">
                {loading ? (
                  <>
                    <Loader2 className="animate-spin" size={18} /> Aguarde...
                  </>
                ) : isLogin ? (
                  'Entrar'
                ) : (
                  'Criar conta e receber 20 Kz'
                )}
              </button>
            </form>
          </div>

          <p className="text-center text-xs text-[var(--muted)] mt-6 flex items-start justify-center gap-1.5 leading-relaxed px-2">
            <AlertTriangle size={14} className="shrink-0 mt-0.5 text-[var(--danger)]" />
            Site de sátira. Nada é real. Não use dinheiro de verdade.
          </p>
        </div>
      </main>
    );
  }

  return (
    <Dashboard
      user={user}
      balance={balance}
      onBalanceChange={setBalance}
      onLogout={logout}
      updateBalance={updateBalance}
      affiliate={affiliate}
      affiliateLoading={affiliateLoading}
      onRefreshAffiliate={async () => {
        await refreshAffiliate(user.id);
        await loadBalance(user.id);
      }}
      onRefreshBalance={() => {
        void loadBalance(user.id);
      }}
    />
  );
}
