import { Component, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { PlayerIdService } from '../../core/player-id.service';
import { TriggerService } from '../../core/trigger.service';

@Component({
  standalone: true,
  imports: [CommonModule],
  templateUrl: './qr.component.html',
})
export class QrComponent {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private ids = inject(PlayerIdService);
  private trigger = inject(TriggerService);

  status = signal('…');

  private run = effect(() => {
    const code = this.route.snapshot.paramMap.get('code');
    void this.handle(code);
  });

  private async handle(code: string | null) {
    if (!code) {
      this.status.set('no code');
      await this.router.navigateByUrl('/party');
      return;
    }

    const id = this.ids.playerId();
    if (!id) {
      this.status.set('erst Name eingeben…');
      await this.router.navigateByUrl('/');
      return;
    }

    try {
      this.status.set(`trigger: ${code}`);
      await this.trigger.trigger(id, decodeURIComponent(code));
      await this.router.navigateByUrl('/party');
    } catch (e: any) {
      this.status.set(`error: ${String(e?.message ?? e)}`);
      // still go back after a moment
      setTimeout(() => this.router.navigateByUrl('/party'), 800);
    }
  }
}
