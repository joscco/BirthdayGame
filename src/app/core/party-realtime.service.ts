import { Injectable, signal } from '@angular/core';
import { supabase } from './supabase.client';
import { PartyPlayer, PlayerRow, PlayerStateRow } from './types';

function toMillis(ts: string) {
  const n = Date.parse(ts);
  return Number.isFinite(n) ? n : Date.now();
}

@Injectable({ providedIn: 'root' })
export class PartyRealtimeService {
  readonly players = signal<PartyPlayer[]>([]);
  readonly loading = signal(true);

  private channel: ReturnType<typeof supabase.channel> | null = null;

  async start(room = 'main') {
    this.loading.set(true);

    // initial fetch (join players + state in two queries; simple and reliable)
    const [playersRes, stateRes] = await Promise.all([
      supabase.from('players').select('id,name,avatar_url,last_seen'),
      supabase.from('player_state').select('player_id,room,pose,item,x,y,updated_at').eq('room', room),
    ]);

    if (playersRes.error) throw playersRes.error;
    if (stateRes.error) throw stateRes.error;

    const playersById = new Map<string, PlayerRow>();
    (playersRes.data as PlayerRow[]).forEach(p => playersById.set(p.id, p));

    const merged: PartyPlayer[] = (stateRes.data as PlayerStateRow[]).map(s => {
      const p = playersById.get(s.player_id);
      return {
        id: s.player_id,
        name: p?.name ?? '???',
        avatarUrl: p?.avatar_url ?? null,
        room: s.room,
        pose: s.pose as any,
        item: s.item as any,
        x: clamp01(s.x ?? 0.5),
        y: clamp01(s.y ?? 0.5),
        updatedAt: toMillis(s.updated_at),
      };
    });

    this.players.set(merged);
    this.loading.set(false);

    // realtime: listen for changes on player_state
    this.channel?.unsubscribe();
    this.channel = supabase
      .channel('party_state')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'player_state', filter: `room=eq.${room}` },
        (payload) => this.applyStateChange(payload)
      )
      .subscribe();
  }

  stop() {
    this.channel?.unsubscribe();
    this.channel = null;
  }

  private applyStateChange(payload: any) {
    const type = payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE';
    const row = (type === 'DELETE' ? payload.old : payload.new) as PlayerStateRow;

    this.players.update(curr => {
      if (type === 'DELETE') return curr.filter(p => p.id !== row.player_id);

      const patch = {
        id: row.player_id,
        room: row.room,
        pose: row.pose as any,
        item: row.item as any,
        x: clamp01(row.x ?? 0.5),
        y: clamp01(row.y ?? 0.5),
        updatedAt: toMillis(row.updated_at),
      };

      const idx = curr.findIndex(p => p.id === row.player_id);
      if (idx === -1) {
        // Name/avatar might be missing on cold insert; we’ll refetch minimal data
        return [...curr, { ...patch, name: 'New', avatarUrl: null }];
      }

      const updated = [...curr];
      updated[idx] = { ...updated[idx], ...patch };
      return updated;
    });
  }
}

function clamp01(n: number) {
  if (!Number.isFinite(n)) return 0.5;
  return Math.max(0, Math.min(1, n));
}
