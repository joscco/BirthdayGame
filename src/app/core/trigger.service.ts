import { Injectable } from '@angular/core';
import { environment } from '../../environments/environment';

type JoinResp = { playerId: string };
type TriggerResp = { ok: true; patch: any };

@Injectable({ providedIn: 'root' })
export class TriggerService {
  async join(name: string, playerId?: string): Promise<JoinResp> {
    const res = await fetch(environment.triggerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'join', name, playerId }),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }

  async trigger(playerId: string, code: string): Promise<TriggerResp> {
    const res = await fetch(environment.triggerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'trigger', playerId, code }),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }

  // Convenience: movement via code
  async moveTo(playerId: string, x: number, y: number) {
    // You can implement mapCodeToPatch("move:x,y") later.
    // For MVP we’ll use a dedicated trigger code format:
    const code = `move:${x.toFixed(4)},${y.toFixed(4)}`;
    return this.trigger(playerId, code);
  }
}
