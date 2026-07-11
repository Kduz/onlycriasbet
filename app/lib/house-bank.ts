import { supabase } from './supabase';

/** Email da conta da banca / admin. */
export const HOUSE_BANK_EMAIL = 'donodabanca@gmail.com';

export function isHouseEmail(email?: string | null) {
  if (!email) return false;
  return email.trim().toLowerCase() === HOUSE_BANK_EMAIL.toLowerCase();
}

/**
 * Credita na conta da banca o valor perdido pelo jogador.
 * Requer RPC `credit_house_bank` (supabase/house-admin.sql).
 */
export async function creditHouseBank(
  amount: number,
  game?: string,
  detail?: string
): Promise<number> {
  const amt = Math.floor(amount);
  if (amt < 1) return 0;

  try {
    const { data, error } = await supabase.rpc('credit_house_bank', {
      p_amount: amt,
      p_game: game ?? null,
      p_detail: detail ?? null,
    });
    if (error) {
      console.warn('credit_house_bank:', error.message);
      return 0;
    }
    return Number(data) || 0;
  } catch (e) {
    console.warn('credit_house_bank failed', e);
    return 0;
  }
}

export type HouseLedgerRow = {
  id: string;
  amount: number;
  game: string | null;
  detail: string | null;
  from_user_id: string | null;
  from_email: string | null;
  created_at: string;
};

export type AdminPlayerRow = {
  id: string;
  email: string | null;
  balance: number;
  is_admin?: boolean;
  is_house?: boolean;
};

export type AdminDashboard = {
  ok: boolean;
  error?: string;
  house_id?: string;
  house_balance: number;
  players_count: number;
  players_total_balance: number;
  ledger_total: number;
  ledger: HouseLedgerRow[];
  players: AdminPlayerRow[];
};

export async function fetchAdminDashboard(): Promise<AdminDashboard> {
  const empty: AdminDashboard = {
    ok: false,
    house_balance: 0,
    players_count: 0,
    players_total_balance: 0,
    ledger_total: 0,
    ledger: [],
    players: [],
  };

  try {
    const { data, error } = await supabase.rpc('get_admin_dashboard');
    if (error) {
      return { ...empty, error: error.message };
    }
    const raw = data as Record<string, unknown> | null;
    if (!raw || raw.ok === false) {
      return { ...empty, error: String(raw?.error ?? 'sem permissão') };
    }

    return {
      ok: true,
      house_id: raw.house_id as string | undefined,
      house_balance: Number(raw.house_balance ?? 0),
      players_count: Number(raw.players_count ?? 0),
      players_total_balance: Number(raw.players_total_balance ?? 0),
      ledger_total: Number(raw.ledger_total ?? 0),
      ledger: Array.isArray(raw.ledger) ? (raw.ledger as HouseLedgerRow[]) : [],
      players: Array.isArray(raw.players) ? (raw.players as AdminPlayerRow[]) : [],
    };
  } catch (e) {
    return {
      ...empty,
      error: e instanceof Error ? e.message : 'erro',
    };
  }
}

/** Marca o user donodabanca como is_house/is_admin (após cadastro). */
export async function promoteHouseAccount() {
  const { data, error } = await supabase.rpc('promote_house_account', {
    p_email: HOUSE_BANK_EMAIL,
  });
  if (error) return { ok: false as const, error: error.message };
  const raw = data as { ok?: boolean; error?: string; id?: string };
  if (!raw?.ok) return { ok: false as const, error: raw?.error ?? 'falhou' };
  return { ok: true as const, id: raw.id };
}

export type AdminCreditResult =
  | {
      ok: true;
      email: string;
      amount: number;
      new_balance: number;
      user_id?: string;
    }
  | { ok: false; error: string };

/**
 * Admin: adiciona saldo a um jogador pelo email.
 * Requer RPC `admin_credit_player` (supabase/admin-credit-player.sql).
 */
export async function adminCreditPlayer(
  email: string,
  amount: number
): Promise<AdminCreditResult> {
  const em = email.trim().toLowerCase();
  const amt = Math.floor(amount);
  if (!em || !em.includes('@')) {
    return { ok: false, error: 'Email invalido' };
  }
  if (amt < 1) {
    return { ok: false, error: 'Valor minimo: 1 Kz' };
  }

  try {
    const { data, error } = await supabase.rpc('admin_credit_player', {
      p_email: em,
      p_amount: amt,
    });
    if (error) {
      return { ok: false, error: error.message };
    }
    const raw = data as Record<string, unknown> | null;
    if (!raw || raw.ok === false) {
      return { ok: false, error: String(raw?.error ?? 'falhou') };
    }
    return {
      ok: true,
      email: String(raw.email ?? em),
      amount: Number(raw.amount ?? amt),
      new_balance: Number(raw.new_balance ?? 0),
      user_id: raw.user_id ? String(raw.user_id) : undefined,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'erro',
    };
  }
}
