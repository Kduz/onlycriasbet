'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import {
  LIVE_CHANNEL,
  LIVE_EVENT,
  newMarkerId,
  type LiveMarker,
} from '../lib/live-presence';
import { maskPlayerLabel } from '../lib/game-feed';

type PublishInput = Omit<LiveMarker, 'id' | 'createdAt' | 'playerId' | 'playerLabel'>;

/**
 * Escuta e publica marcadores de presença em um jogo/rodada.
 * Canal broadcast único — filtra por game + roundIndex.
 */
export function useLiveMarkers(
  game: LiveMarker['game'],
  roundIndex: number,
  userId: string,
  userEmail?: string | null
) {
  const [markers, setMarkers] = useState<LiveMarker[]>([]);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const seen = useRef(new Set<string>());

  useEffect(() => {
    setMarkers((prev) => prev.filter((m) => m.roundIndex === roundIndex));
  }, [roundIndex]);

  const roundRef = useRef(roundIndex);
  useEffect(() => {
    roundRef.current = roundIndex;
  }, [roundIndex]);

  useEffect(() => {
    const ch = supabase.channel(`${LIVE_CHANNEL}-${game}`, {
      config: { broadcast: { self: true } },
    });

    ch.on('broadcast', { event: LIVE_EVENT }, ({ payload }) => {
      const m = payload as LiveMarker;
      if (!m?.id || m.game !== game) return;
      if (seen.current.has(m.id)) return;
      seen.current.add(m.id);
      if (seen.current.size > 120) {
        seen.current = new Set([...seen.current].slice(-60));
      }
      setMarkers((prev) => {
        const next = [...prev.filter((x) => x.id !== m.id), m];
        // mantém só rodada atual + a do evento
        const r = roundRef.current;
        return next.filter((x) => x.roundIndex === r || x.roundIndex === m.roundIndex).slice(-40);
      });
    });

    ch.subscribe();
    channelRef.current = ch;

    return () => {
      channelRef.current = null;
      void supabase.removeChannel(ch);
    };
  }, [game]);

  const publish = useCallback(
    (input: PublishInput) => {
      const marker: LiveMarker = {
        ...input,
        id: newMarkerId(),
        playerId: userId,
        playerLabel: maskPlayerLabel(userEmail),
        createdAt: Date.now(),
      };

      seen.current.add(marker.id);
      setMarkers((prev) => {
        const cleaned = prev.filter((m) => m.roundIndex === marker.roundIndex);
        return [...cleaned.filter((m) => m.id !== marker.id), marker].slice(-40);
      });

      const ch = channelRef.current;
      if (ch) {
        void ch.send({ type: 'broadcast', event: LIVE_EVENT, payload: marker });
      }
      return marker;
    },
    [userId, userEmail]
  );

  const forRound = markers.filter((m) => m.roundIndex === roundIndex);

  return { markers: forRound, publish };
}
