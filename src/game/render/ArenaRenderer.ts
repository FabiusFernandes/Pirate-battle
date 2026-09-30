import { Container, Rectangle, Sprite, type Renderer, type Texture } from 'pixi.js';
import type { GameAssets } from '@/game/assets/GameAssets';
import { STAMPS, TILE_SIZE, arenaSize, type ArenaMap, type StampDefinition } from '@/game/world/arenaMap';

/**
 * Builds the static arena (water + islands) once per match and bakes it into a single
 * texture. Tiles are composed at 1:1 texel scale, so the baked image has no seams when the
 * arena is later scaled to fit the screen, and the background costs one draw per frame.
 *
 * The baked texture is owned by this renderer and destroyed with it; tile textures belong
 * to the shared asset cache and are left untouched.
 */
export class ArenaRenderer {
  readonly view: Sprite;
  private readonly baked: Texture;

  constructor(assets: GameAssets, map: ArenaMap, renderer: Renderer) {
    const composition = ArenaRenderer.compose(assets, map);
    const { width, height } = arenaSize(map);
    this.baked = renderer.generateTexture({
      target: composition,
      frame: new Rectangle(0, 0, width, height),
      resolution: assets.resolution,
      antialias: false,
    });
    composition.destroy({ children: true });

    this.view = new Sprite(this.baked);
    this.view.label = 'arena';
  }

  private static compose(assets: GameAssets, map: ArenaMap): Container {
    const root = new Container();
    const waterTexture = assets.texture('tiles', `tile_${map.waterTile}`);
    for (let row = 0; row < map.rows; row++) {
      for (let col = 0; col < map.cols; col++) {
        const sprite = new Sprite(waterTexture);
        sprite.position.set(col * TILE_SIZE, row * TILE_SIZE);
        sprite.setSize(TILE_SIZE, TILE_SIZE);
        root.addChild(sprite);
      }
    }

    for (const placement of map.placements) {
      const stamp: StampDefinition = STAMPS[placement.stamp];
      stamp.tiles.forEach((line, r) => {
        line.forEach((tileId, c) => {
          if (tileId === 0) return;
          const sprite = new Sprite(assets.texture('tiles', `tile_${tileId}`));
          sprite.position.set((placement.col + c) * TILE_SIZE, (placement.row + r) * TILE_SIZE);
          sprite.setSize(TILE_SIZE, TILE_SIZE);
          root.addChild(sprite);
        });
      });
    }
    return root;
  }

  destroy(): void {
    this.view.destroy();
    this.baked.destroy(true);
  }
}
