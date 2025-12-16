import {AfterViewInit, Component, ElementRef, OnDestroy, ViewChild, computed, effect, inject} from '@angular/core';
import {CommonModule} from '@angular/common';
import {PartyRealtimeService} from '../../core/party-realtime.service';
import {PlayerIdService} from '../../core/player-id.service';
import {PartySceneService} from './party-scene.service';
import {TriggerService} from '../../core/trigger.service';

@Component({
  standalone: true,
  selector: 'app-party',
  imports: [CommonModule],
  templateUrl: './party.component.html',
})
export class PartyComponent implements AfterViewInit, OnDestroy {
  private realtimeService = inject(PartyRealtimeService);
  private ids = inject(PlayerIdService);
  private scene = inject(PartySceneService);
  private trigger = inject(TriggerService);

  @ViewChild('host', {static: true}) host!: ElementRef<HTMLElement>;

  loading = this.realtimeService.loading;
  count = computed(() => this.realtimeService.players().length);
  myId = this.ids.playerId;

  private syncEffect = effect(() => {
    this.scene.sync(this.realtimeService.players(), this.myId());
  });

  async ngAfterViewInit() {
    await this.scene.mount(this.host.nativeElement);
    await this.realtimeService.start('main');
  }

  ngOnDestroy() {
    this.realtimeService.stop();
    this.scene.destroy();
    this.syncEffect.destroy();
  }

  async dance() {
    await this.fire('dance');
  }

  async cheers() {
    await this.fire('cheers');
  }

  async hat() {
    await this.fire('hat');
  }

  private async fire(code: string) {
    const id = this.myId();
    if (!id) return;
    await this.trigger.trigger(id, code);
  }
}
