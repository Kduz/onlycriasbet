'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { TrendingDown, TrendingUp, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import {
  formatOutcomeText,
  GAME_FEED_CHANNEL,
  GAME_FEED_EVENT,
  maskPlayerLabel,
  type GameOutcomePayload,
  type PushOutcomeInput,
} from '../lib/game-feed';

type ToastItem = GameOutcomePayload & {
  isSelf: boolean;
};

type GameToastContextValue = {
  /** Mostra pop-up local + avisa os outros jogadores (use em qualquer jogo). */
  pushOutcome: (input: PushOutcomeInput) => void;
};

const GameToastContext = createContext<GameToastContextValue | null>(null);

const TOAST_MS = 4500;
const MAX_TOASTS = 5;

export function useGameToasts() {
  const ctx = useContext(GameToastContext);
  if (!ctx) {
    // Fallback seguro se alguém esquecer o provider
    return {
      pushOutcome: (input: PushOutcomeInput) => {
        console.warn('GameToastProvider ausente:', input);
      },
    };
  }
  return ctx;
}

type ProviderProps = {
  userId: string;
  userEmail?: string | null;
  children: ReactNode;
};

export default function GameToastProvider({
  userId,
  userEmail,
  children,
}: ProviderProps) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const seenIds = useRef(new Set<string>());
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const addToast = useCallback((item: ToastItem) => {
    if (seenIds.current.has(item.id)) return;
    seenIds.current.add(item.id);

    // Limpa IDs antigos
    if (seenIds.current.size > 80) {
      const arr = [...seenIds.current];
      seenIds.current = new Set(arr.slice(-40));
    }

    setToasts((prev) => [item, ...prev].slice(0, MAX_TOASTS));

    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== item.id));
    }, TOAST_MS);
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    const channel = supabase.channel(GAME_FEED_CHANNEL, {
      config: { broadcast: { self: false } },
    });

    channel.on('broadcast', { event: GAME_FEED_EVENT }, ({ payload }) => {
      const data = payload as GameOutcomePayload;
      if (!data?.id || !data.playerId) return;
      if (data.playerId === userId) return; // já mostramos localmente
      if (typeof data.amount !== 'number' || data.amount < 1) return;

      addToast({
        ...data,
        isSelf: false,
      });
    });

    channel.subscribe();
    channelRef.current = channel;

    return () => {
      channelRef.current = null;
      void supabase.removeChannel(channel);
    };
  }, [userId, addToast]);

  const pushOutcome = useCallback(
    (input: PushOutcomeInput) => {
      if (!input.amount || input.amount < 1) return;

      const payload: GameOutcomePayload = {
        id:
          typeof crypto !== 'undefined' && crypto.randomUUID
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        kind: input.kind,
        amount: Math.floor(input.amount),
        game: input.game,
        gameLabel: input.gameLabel,
        playerId: userId,
        playerLabel: maskPlayerLabel(userEmail),
        detail: input.detail,
        createdAt: Date.now(),
      };

      // Pop-up pra você
      addToast({ ...payload, isSelf: true });

      // Pop-up pros outros
      const ch = channelRef.current;
      if (ch) {
        void ch.send({
          type: 'broadcast',
          event: GAME_FEED_EVENT,
          payload,
        });
      }
    },
    [userId, userEmail, addToast]
  );

  const value = useMemo(() => ({ pushOutcome }), [pushOutcome]);

  return (
    <GameToastContext.Provider value={value}>
      {children}

      <div className="game-toast-stack" aria-live="polite" aria-relevant="additions">
        <AnimatePresence initial={false}>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: -16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: 40, scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 420, damping: 32 }}
              className={`game-toast ${t.kind === 'win' ? 'game-toast-win' : 'game-toast-loss'}`}
              role="status"
            >
              <span className="game-toast-icon">
                {t.kind === 'win' ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
              </span>
              <div className="game-toast-body min-w-0">
                <p className="game-toast-title">
                  {t.kind === 'win' ? 'Ganhou' : 'Perdeu'}{' '}
                  <strong>
                    {t.amount.toLocaleString('pt-BR')} Kz
                  </strong>
                </p>
                <p className="game-toast-sub truncate">
                  {formatOutcomeText(t)}
                  {' · '}
                  {t.gameLabel}
                </p>
              </div>
              <button
                type="button"
                className="game-toast-close"
                onClick={() => dismiss(t.id)}
                aria-label="Fechar"
              >
                <X size={14} />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </GameToastContext.Provider>
  );
}
