import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { PlayerIdService } from '../../core/player-id.service';
import { TriggerService } from '../../core/trigger.service';

@Component({
  standalone: true,
  imports: [CommonModule],
  templateUrl: './join.component.html',
})
export class JoinComponent {
  private ids = inject(PlayerIdService);
  private trigger = inject(TriggerService);
  private router = inject(Router);

  name = signal('');
  busy = signal(false);
  error = signal<string | null>(null);

  async go() {
    this.error.set(null);
    this.busy.set(true);
    try {
      const resp = await this.trigger.join(this.name().trim(), this.ids.playerId() ?? undefined);
      this.ids.set(resp.playerId);
      await this.router.navigateByUrl('/party');
    } catch (e: any) {
      this.error.set(String(e?.message ?? e));
    } finally {
      this.busy.set(false);
    }
  }
}
