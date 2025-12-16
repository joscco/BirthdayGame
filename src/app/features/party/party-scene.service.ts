import {Injectable} from '@angular/core';
import * as PIXI from 'pixi.js';
import {PartyPlayer} from '../../core/types';

type Entity = {
  id: string;
  container: PIXI.Container;
  avatar: PIXI.Sprite;
  label: PIXI.Text;
  itemText: PIXI.Text;
  targetX: number;
  targetY: number;
};

@Injectable({providedIn: 'root'})
export class PartySceneService {
  private app: PIXI.Application | null = null;

  /** World container that we move for camera centering */
  private world: PIXI.Container | null = null;

  /** Non-scrolling background graphic */
  private bg: PIXI.Graphics | null = null;

  private entities = new Map<string, Entity>();

  private cameraId: string | null = null;

  private draggingId: string | null = null;
  private dragOffset = {x: 0, y: 0};

  private readonly WORLD_W = 540;
  private readonly WORLD_H = 1080;
  private readonly CAMERA_LERP = 0.18; // smooth camera

  async mount(host: HTMLElement): Promise<void> {
    this.destroy();

    this.app = new PIXI.Application();
    await this.app.init({resizeTo: host, antialias: true, backgroundAlpha: 0});
    host.appendChild(this.app.canvas);

    // Background on stage (not in world => won't scroll)
    this.bg = new PIXI.Graphics();
    this.bg.eventMode = 'static';
    this.bg.on('pointerdown', () => this.onBgDown());
    this.app.stage.addChild(this.bg);

    // World container (everything inside scrolls with camera)
    this.world = new PIXI.Container();
    this.app.stage.addChild(this.world);

    this.app.ticker.add(() => this.tick());
  }

  destroy() {
    this.entities.clear();
    this.draggingId = null;
    this.cameraId = null;

    if (this.app) {
      this.app.destroy(true);
    }

    this.app = null;
    this.world = null;
    this.bg = null;
  }

  setCameraTarget(id: string | null) {
    this.cameraId = id;
  }

  /** Sync desired state into scene (create/update/remove entities) */
  sync(players: PartyPlayer[], myId: string | null) {
    if (!this.app || !this.world) return;

    // Remove missing
    const ids = new Set(players.map(p => p.id));
    for (const [id, ent] of this.entities) {
      if (!ids.has(id)) {
        ent.container.destroy({children: true});
        this.entities.delete(id);
      }
    }

    // Upsert present
    for (const player of players) {
      const px = clamp01(player.x) * this.WORLD_W;
      const py = clamp01(player.y) * this.WORLD_H;

      const ent = this.entities.get(player.id) ?? this.createEntity(player);
      ent.targetX = px;
      ent.targetY = py;

      // Spawn immediately at target once (instead of lerping from 0,0)
      if (ent.container.x === 0 && ent.container.y === 0) {
        ent.container.x = px;
        ent.container.y = py;
      }

      console.log(player, myId)
      ent.label.text = player.name + (player.id === myId ? ' (du)' : '');
      ent.itemText.text = player.item === 'none' ? '' : `🎁 ${player.item}`;

      // super simple pose effect
      ent.container.scale.set(player.pose === 'dance' ? 1.06 : 1.0);

      // avatar refresh if url changed
      const currentUrl = (ent.avatar.texture as any).__url as string | undefined;
      if (player.avatarUrl && player.avatarUrl !== currentUrl) {
        const tex = PIXI.Texture.from(player.avatarUrl);
        (tex as any).__url = player.avatarUrl;
        ent.avatar.texture = tex;
        ent.avatar.alpha = 1;
      }
    }

    // Camera wants to follow myId
    this.setCameraTarget(myId);
  }

  /** Convert a *world pixel position* into normalized (0..1) in world coords */
  toNormalizedWorld(worldX: number, worldY: number) {
    if (!this.app) return {x: 0.5, y: 0.5};
    return {
      x: clamp01(worldX / this.WORLD_W),
      y: clamp01(worldY / this.WORLD_H),
    };
  }

  /** Pointer handlers (Pixi Federated events) */
  onPointerDownEntity(id: string, e: PIXI.FederatedPointerEvent) {
    this.draggingId = id;

    const ent = this.entities.get(id);
    if (!ent) return;

    // e.global is screen coords; convert to world coords by subtracting world transform
    const global = e.global;

    this.dragOffset.x = ent.container.x - this.screenToWorldX(global.x);
    this.dragOffset.y = ent.container.y - this.screenToWorldY(global.y);
  }

  onPointerMove(e: PIXI.FederatedPointerEvent) {
    if (!this.app || !this.draggingId) return;
    const ent = this.entities.get(this.draggingId);
    if (!ent) return;

    const global = e.global;
    const wx = this.screenToWorldX(global.x);
    const wy = this.screenToWorldY(global.y);

    ent.container.x = wx + this.dragOffset.x;
    ent.container.y = wy + this.dragOffset.y;

    ent.targetX = ent.container.x;
    ent.targetY = ent.container.y;
  }

  onPointerUp() {
    this.draggingId = null;
  }

  getDraggingWorldPosition() {
    if (!this.draggingId) return null;
    const ent = this.entities.get(this.draggingId);
    if (!ent) return null;
    return {id: this.draggingId, x: ent.container.x, y: ent.container.y};
  }

  private createEntity(p: PartyPlayer): Entity {
    if (!this.world) throw new Error('Scene not mounted');

    const c = new PIXI.Container();
    c.eventMode = 'static';
    c.cursor = 'pointer';

    // Subtle bubble
    const bubble = new PIXI.Graphics().circle(0, 0, 38).fill(0xffffff, 1);
    bubble.alpha = 0.18;

    // Colored body
    const body = new PIXI.Graphics().circle(0, 0, 28).fill(hashColor(p.id), 1);
    body.alpha = 0.9;

    // Initial
    const initial = new PIXI.Text({
      text: (p.name?.trim()?.[0] ?? '?').toUpperCase(),
      style: {fontSize: 22, fill: 0xffffff, fontWeight: '700' as any},
    });
    initial.anchor.set(0.5);

    // Avatar sprite (optional)
    const tex = p.avatarUrl ? PIXI.Texture.from(p.avatarUrl) : PIXI.Texture.EMPTY;
    (tex as any).__url = p.avatarUrl ?? '';
    const avatar = new PIXI.Sprite(tex);
    avatar.width = 64;
    avatar.height = 64;
    avatar.anchor.set(0.5);
    avatar.alpha = p.avatarUrl ? 1 : 0;

    const label = new PIXI.Text({text: p.name, style: {fontSize: 12, fill: 0xffffff}});
    label.anchor.set(0.5, 0);
    label.y = 44;

    const itemText = new PIXI.Text({text: '', style: {fontSize: 11, fill: 0xffffff}});
    itemText.anchor.set(0.5, 1);
    itemText.y = -44;

    c.addChild(bubble, body, initial, avatar, label, itemText);

    // Drag hook (we still gate "only me can move" in PartyComponent)
    c.on('pointerdown', (e) => this.onPointerDownEntity(p.id, e));
    c.on('pointermove', (e) => this.onPointerMove(e));
    c.on('pointerup', () => this.onPointerUp());
    c.on('pointerupoutside', () => this.onPointerUp());
    c.on('pointercancel', () => this.onPointerUp());

    this.world.addChild(c);

    const ent: Entity = {id: p.id, container: c, avatar, label, itemText, targetX: 0, targetY: 0};
    this.entities.set(p.id, ent);
    return ent;
  }

  private tick() {
    if (!this.app || !this.world) return;

    // Keep background sized to screen (NOT world)
    if (this.bg) {
      this.bg.clear().rect(0, 0, this.app.renderer.width, this.app.renderer.height).fill(0xffffff, 1);
      this.bg.alpha = 0.06;
    }

    // Smooth move to targets (except currently dragged)
    for (const ent of this.entities.values()) {
      if (this.draggingId === ent.id) continue;
      ent.container.x += (ent.targetX - ent.container.x) * 0.12;
      ent.container.y += (ent.targetY - ent.container.y) * 0.12;
    }

    // Camera: keep my player centered by moving the WORLD container
    if (this.cameraId) {
      const me = this.entities.get(this.cameraId);
      if (me) {
        const cx = this.app.renderer.width / 2;
        const cy = this.app.renderer.height / 2;

// desired world offset so that "me" is centered
        let desiredX = cx - me.container.x;
        let desiredY = cy - me.container.y;

// clamp camera to world bounds so you don't scroll into emptiness
// world offset ranges: [screen - WORLD] .. [0]
        const minX = this.app.renderer.width - this.WORLD_W;
        const minY = this.app.renderer.height - this.WORLD_H;

// if world is smaller than screen, just center it
        if (minX > 0) desiredX = minX / 2;
        else desiredX = clamp(desiredX, minX, 0);

        if (minY > 0) desiredY = minY / 2;
        else desiredY = clamp(desiredY, minY, 0);

// smooth camera
        this.world.x += (desiredX - this.world.x) * this.CAMERA_LERP;
        this.world.y += (desiredY - this.world.y) * this.CAMERA_LERP;

      }
    }
  }

  private onBgDown() {
    // tap background ends drag
    this.onPointerUp();
  }

  private screenToWorldX(screenX: number) {
    // world.x is camera offset
    return screenX - (this.world?.x ?? 0);
  }

  private screenToWorldY(screenY: number) {
    return screenY - (this.world?.y ?? 0);
  }
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function clamp01(n: number) {
  if (!Number.isFinite(n)) return 0.5;
  return Math.max(0, Math.min(1, n));
}

function hashColor(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  }
  const r = (h >>> 16) & 255;
  const g = (h >>> 8) & 255;
  const b = h & 255;
  return (r << 16) | (g << 8) | b;
}
