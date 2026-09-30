import { Container, NineSliceSprite, Rectangle, Sprite, Texture } from 'pixi.js';
import type { GameAssets } from '@/game/assets/GameAssets';

/** Fill area inside `enemy_health_frame`, from ui_sheet.json (`ui.layout.fill_rect`, logical px). */
const FILL_RECT = { x: 24, y: 12, w: 112, h: 15 } as const;
const FRAME_SIZE = { w: 160, h: 40 } as const;
const CAP = 7;

export interface HealthBarTextures {
  frame: Texture;
  green: Texture;
  red: Texture;
}

/** Cuts the fill region out of the atlas frames once; the sub-textures share the atlas source. */
export function createHealthBarTextures(assets: GameAssets): HealthBarTextures {
  const sub = (name: string): Texture => {
    const base = assets.texture('ui', name);
    return new Texture({
      source: base.source,
      frame: new Rectangle(base.frame.x + FILL_RECT.x, base.frame.y + FILL_RECT.y, FILL_RECT.w, FILL_RECT.h),
    });
  };
  return {
    frame: assets.texture('ui', 'enemy_health_frame'),
    green: sub('enemy_health_fill_green'),
    red: sub('enemy_health_fill_red'),
  };
}

export function destroyHealthBarTextures(textures: HealthBarTextures): void {
  // Only the sub-textures created above; the atlas source stays cached.
  textures.green.destroy(false);
  textures.red.destroy(false);
}

/**
 * Health indicator drawn above a ship. The fill is a horizontal nine-slice so its rounded
 * caps keep their shape at any health value. Only redraws when the value changes.
 */
export class HealthBar {
  readonly view = new Container({ label: 'health-bar' });
  private readonly fill: NineSliceSprite;
  private lastFraction = -1;

  constructor(
    private readonly textures: HealthBarTextures,
    width: number,
  ) {
    const scale = width / FRAME_SIZE.w;
    const frame = new Sprite(textures.frame);
    frame.anchor.set(0.5);
    frame.scale.set(scale);

    this.fill = new NineSliceSprite({ texture: textures.green, leftWidth: CAP, rightWidth: CAP, topHeight: 0, bottomHeight: 0 });
    this.fill.height = FILL_RECT.h;
    const fillHolder = new Container();
    fillHolder.scale.set(scale);
    fillHolder.position.set((FILL_RECT.x - FRAME_SIZE.w / 2) * scale, (FILL_RECT.y - FRAME_SIZE.h / 2) * scale);
    fillHolder.addChild(this.fill);

    this.view.addChild(frame, fillHolder);
  }

  set(fraction: number): void {
    const f = Math.max(0, Math.min(1, fraction));
    if (f === this.lastFraction) return;
    this.lastFraction = f;
    this.fill.texture = f > 0.35 ? this.textures.green : this.textures.red;
    this.fill.visible = f > 0;
    this.fill.width = Math.max(CAP * 2, FILL_RECT.w * f);
  }
}
