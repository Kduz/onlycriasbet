import { supabase } from './supabase';

/** Comissão do afiliado sobre o ganho (cash-out) do indicado. */
export const AFFILIATE_COMMISSION_RATE = 0.1;

export const REF_STORAGE_KEY = 'crias_ref_code';

export type AffiliateProfile = {
  affiliateCode: string;
  referredBy: string | null;
  referredByCode: string | null;
  affiliateEarnings: number;
  referralsCount: number;
  /** true se o banco tem o schema de afiliados */
  schemaReady: boolean;
  setupError?: string;
};

export type CommissionHistoryItem = {
  id: string;
  fromUserId: string;
  fromEmail: string | null;
  winAmount: number;
  commission: number;
  createdAt: string;
};

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateAffiliateCode(length = 8): string {
  let code = '';
  const bytes = new Uint8Array(length);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
    for (let i = 0; i < length; i++) {
      code += CODE_CHARS[bytes[i] % CODE_CHARS.length];
    }
  } else {
    for (let i = 0; i < length; i++) {
      code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    }
  }
  return code;
}

export function getInviteLink(code: string, origin?: string): string {
  const base =
    origin ?? (typeof window !== 'undefined' ? window.location.origin : '');
  return `${base}/?ref=${encodeURIComponent(code)}`;
}

export function captureRefFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const ref = params.get('ref')?.trim().toUpperCase() ?? null;
  if (ref) {
    try {
      localStorage.setItem(REF_STORAGE_KEY, ref);
    } catch {
      /* ignore */
    }
    return ref;
  }
  try {
    return localStorage.getItem(REF_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function clearStoredRef() {
  try {
    localStorage.removeItem(REF_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/** Detecta se as colunas/RPC de afiliado existem no Supabase. */
export async function checkAffiliateSchema(): Promise<{
  ready: boolean;
  error?: string;
}> {
  // 1) RPC preferida
  const { error: rpcErr } = await supabase.rpc('get_affiliate_profile');
  if (!rpcErr) return { ready: true };

  // 2) Colunas na tabela
  const { error: colErr } = await supabase
    .from('profiles')
    .select('affiliate_code')
    .limit(1);

  if (!colErr) return { ready: true };

  if (/affiliate_code|does not exist|42703/i.test(colErr.message)) {
    return {
      ready: false,
      error:
        'Schema de afiliados ausente no Supabase. Rode o arquivo supabase/setup-affiliates.sql no SQL Editor.',
    };
  }

  return { ready: false, error: colErr.message };
}

export async function ensureAffiliateCode(userId: string): Promise<string> {
  // RPC security definer
  const { data: rpcCode, error: rpcErr } = await supabase.rpc('ensure_affiliate_code', {
    p_user: userId,
  });
  if (!rpcErr && typeof rpcCode === 'string' && rpcCode.length > 0) {
    return rpcCode;
  }

  const { data: profile, error: selErr } = await supabase
    .from('profiles')
    .select('affiliate_code')
    .eq('id', userId)
    .maybeSingle();

  if (selErr && /affiliate_code|42703/i.test(selErr.message)) {
    throw new Error(
      'Coluna affiliate_code não existe. Rode supabase/setup-affiliates.sql no Supabase.'
    );
  }

  if (profile?.affiliate_code) {
    return profile.affiliate_code as string;
  }

  for (let attempt = 0; attempt < 8; attempt++) {
    const code = generateAffiliateCode();
    const { error } = await supabase
      .from('profiles')
      .update({ affiliate_code: code })
      .eq('id', userId);

    if (!error) {
      const { data: confirmed } = await supabase
        .from('profiles')
        .select('affiliate_code')
        .eq('id', userId)
        .maybeSingle();
      if (confirmed?.affiliate_code) return confirmed.affiliate_code as string;
      return code;
    }

    if (/affiliate_code|42703/i.test(error.message)) {
      throw new Error(
        'Coluna affiliate_code não existe. Rode supabase/setup-affiliates.sql no Supabase.'
      );
    }
  }

  const fallback = `C${userId.replace(/-/g, '').slice(0, 7).toUpperCase()}`;
  await supabase.from('profiles').update({ affiliate_code: fallback }).eq('id', userId);
  return fallback;
}

export async function loadAffiliateProfile(userId: string): Promise<AffiliateProfile> {
  // Caminho preferido: uma RPC só
  const { data: rpcData, error: rpcError } = await supabase.rpc('get_affiliate_profile', {
    p_user: userId,
  });

  if (!rpcError && rpcData && typeof rpcData === 'object') {
    const d = rpcData as Record<string, unknown>;
    if (d.ok === true) {
      return {
        affiliateCode: String(d.affiliate_code ?? ''),
        referredBy: (d.referred_by as string | null) ?? null,
        referredByCode: (d.referred_by_code as string | null) ?? null,
        affiliateEarnings: Number(d.affiliate_earnings ?? 0),
        referralsCount: Number(d.referrals_count ?? 0),
        schemaReady: true,
      };
    }
  }

  // Fallback manual
  try {
    const affiliateCode = await ensureAffiliateCode(userId);

    const { data: profile, error } = await supabase
      .from('profiles')
      .select('affiliate_code, referred_by, affiliate_earnings')
      .eq('id', userId)
      .maybeSingle();

    if (error && /affiliate_code|referred_by|42703/i.test(error.message)) {
      return {
        affiliateCode: '--------',
        referredBy: null,
        referredByCode: null,
        affiliateEarnings: 0,
        referralsCount: 0,
        schemaReady: false,
        setupError:
          'Schema de afiliados ausente. Rode supabase/setup-affiliates.sql no SQL Editor do Supabase.',
      };
    }

    let referredByCode: string | null = null;
    const referredBy = (profile?.referred_by as string | null) ?? null;

    if (referredBy) {
      const { data: referrer } = await supabase
        .from('profiles')
        .select('affiliate_code')
        .eq('id', referredBy)
        .maybeSingle();
      referredByCode = (referrer?.affiliate_code as string | null) ?? null;
    }

    const { count } = await supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('referred_by', userId);

    return {
      affiliateCode: (profile?.affiliate_code as string) || affiliateCode,
      referredBy,
      referredByCode,
      affiliateEarnings: Number(profile?.affiliate_earnings ?? 0),
      referralsCount: count ?? 0,
      schemaReady: true,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erro ao carregar afiliados';
    return {
      affiliateCode: '--------',
      referredBy: null,
      referredByCode: null,
      affiliateEarnings: 0,
      referralsCount: 0,
      schemaReady: false,
      setupError: msg,
    };
  }
}

export async function loadCommissionHistory(
  affiliateId: string,
  limit = 30
): Promise<CommissionHistoryItem[]> {
  const { data, error } = await supabase
    .from('affiliate_commissions')
    .select('id, from_user_id, win_amount, commission, created_at')
    .eq('affiliate_id', affiliateId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error || !data?.length) {
    return [];
  }

  const fromIds = [...new Set(data.map((row) => row.from_user_id as string))];
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, email')
    .in('id', fromIds);

  const emailById = new Map(
    (profiles ?? []).map((p) => [p.id as string, (p.email as string | null) ?? null])
  );

  return data.map((row) => ({
    id: row.id as string,
    fromUserId: row.from_user_id as string,
    fromEmail: emailById.get(row.from_user_id as string) ?? null,
    winAmount: Number(row.win_amount),
    commission: Number(row.commission),
    createdAt: row.created_at as string,
  }));
}

/**
 * Vincula o usuário a um afiliado pelo código.
 */
export async function applyAffiliateCode(
  userId: string,
  ownAffiliateCode: string,
  inputCode: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const code = inputCode.trim().toUpperCase();
  if (!code) return { ok: false, error: 'Digite um código de afiliado.' };

  if (code === ownAffiliateCode.toUpperCase()) {
    return { ok: false, error: 'Você não pode usar o seu próprio código.' };
  }

  // RPC preferida (encontra código mesmo com RLS)
  const { data: rpcData, error: rpcError } = await supabase.rpc('link_affiliate_code', {
    p_code: code,
  });

  if (!rpcError && rpcData && typeof rpcData === 'object') {
    const d = rpcData as { ok?: boolean; error?: string };
    if (d.ok) {
      clearStoredRef();
      return { ok: true };
    }
    if (d.error) return { ok: false, error: d.error };
  }

  // Fallback direto na tabela
  const { data: me, error: meErr } = await supabase
    .from('profiles')
    .select('referred_by')
    .eq('id', userId)
    .maybeSingle();

  if (meErr && /referred_by|42703/i.test(meErr.message)) {
    return {
      ok: false,
      error:
        'Schema de afiliados não instalado. Rode supabase/setup-affiliates.sql no Supabase SQL Editor.',
    };
  }

  if (me?.referred_by) {
    return { ok: false, error: 'Você já está vinculado a um afiliado.' };
  }

  const { data: referrer, error: findError } = await supabase
    .from('profiles')
    .select('id, affiliate_code')
    .ilike('affiliate_code', code)
    .maybeSingle();

  if (findError) {
    if (/affiliate_code|42703/i.test(findError.message)) {
      return {
        ok: false,
        error:
          'Schema de afiliados não instalado. Rode supabase/setup-affiliates.sql no Supabase SQL Editor.',
      };
    }
    return { ok: false, error: findError.message };
  }
  if (!referrer) return { ok: false, error: 'Código de afiliado inválido.' };

  if (referrer.id === userId) {
    return { ok: false, error: 'Você não pode se afiliar a si mesmo.' };
  }

  const { error } = await supabase
    .from('profiles')
    .update({ referred_by: referrer.id })
    .eq('id', userId)
    .is('referred_by', null);

  if (error) return { ok: false, error: error.message };

  const { data: after } = await supabase
    .from('profiles')
    .select('referred_by')
    .eq('id', userId)
    .maybeSingle();

  if (after?.referred_by !== referrer.id) {
    return { ok: false, error: 'Não foi possível vincular o código. Tente de novo.' };
  }

  clearStoredRef();
  return { ok: true };
}

/**
 * Paga 10% do ganho do jogador para o afiliado que o indicou.
 */
export async function payAffiliateCommission(
  winnerUserId: string,
  winAmount: number
): Promise<number> {
  if (winAmount <= 0) return 0;

  const expected = Math.floor(winAmount * AFFILIATE_COMMISSION_RATE);
  if (expected < 1) return 0;

  const { data: rpcAmount, error: rpcError } = await supabase.rpc(
    'credit_affiliate_commission',
    {
      p_winner: winnerUserId,
      p_win_amount: Math.floor(winAmount),
    }
  );

  if (!rpcError && (typeof rpcAmount === 'number' || typeof rpcAmount === 'string')) {
    return Number(rpcAmount) || 0;
  }

  // Fallback (pode falhar por RLS ao atualizar outro user)
  const { data: winner } = await supabase
    .from('profiles')
    .select('referred_by')
    .eq('id', winnerUserId)
    .maybeSingle();

  const referrerId = winner?.referred_by as string | null;
  if (!referrerId || referrerId === winnerUserId) return 0;

  const { data: referrer } = await supabase
    .from('profiles')
    .select('balance, affiliate_earnings')
    .eq('id', referrerId)
    .maybeSingle();

  if (!referrer) return 0;

  const commission = expected;
  const newBalance = Number(referrer.balance ?? 0) + commission;
  const newEarnings = Number(referrer.affiliate_earnings ?? 0) + commission;

  const { error } = await supabase
    .from('profiles')
    .update({
      balance: newBalance,
      affiliate_earnings: newEarnings,
    })
    .eq('id', referrerId);

  if (error) {
    console.error('Falha ao pagar comissão de afiliado:', error.message, rpcError?.message);
    return 0;
  }

  await supabase.from('affiliate_commissions').insert({
    affiliate_id: referrerId,
    from_user_id: winnerUserId,
    win_amount: Math.floor(winAmount),
    commission,
  });

  return commission;
}

export function formatHistoryDate(iso: string) {
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function maskEmail(email: string | null) {
  if (!email) return 'jogador';
  const [user, domain] = email.split('@');
  if (!domain) return email;
  return `${user.slice(0, 2)}***@${domain}`;
}

/** SQL de setup (para copiar na UI). */
export const AFFILIATE_SETUP_SQL_PATH = 'supabase/setup-affiliates.sql';
