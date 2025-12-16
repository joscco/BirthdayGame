import { Injectable, signal } from '@angular/core';

const KEY = 'party_player_id_v1';

@Injectable({ providedIn: 'root' })
export class PlayerIdService {
  readonly playerId = signal<string | null>(localStorage.getItem(KEY));

  set(id: string) {
    localStorage.setItem(KEY, id);
    this.playerId.set(id);
  }

  clear() {
    localStorage.removeItem(KEY);
    this.playerId.set(null);
  }
}
