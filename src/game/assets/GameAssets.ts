import { Assets, type Spritesheet, type Texture } from 'pixi.js';
import { audio } from '@/game/audio/AudioManager';
import { Store } from '@/lib/store';
import { ATLAS_KEYS, ATLAS_URLS, pickResolution, type AssetResolution, type AtlasKey } from './manifest';

/** Frames the game cannot run without. Validated right after loading, before combat starts. */
const REQUIRED_FRAMES: Record<AtlasKey, readonly string[]> = {
  ui: ['health_frame', 'health_fill_green', 'enemy_health_frame', 'enemy_health_fill_red'],
  tiles: ['tile_18', 'tile_73'],
  ships: ['ship_1', 'cannon_ball', 'explosion_1'],
};

export class GameAssets {
  constructor(
    readonly resolution: AssetResolution,
    private readonly sheets: Record<AtlasKey, Spritesheet>,
  ) {}

  /** Returns a cached texture from an atlas. Textures are shared, never destroyed per match. */
  texture(atlas: AtlasKey, frame: string): Texture {
    const texture = this.sheets[atlas].textures[frame];
    if (!texture) throw new Error(`Missing texture "${frame}" in atlas "${atlas}"`);
    return texture;
  }

  has(atlas: AtlasKey, frame: string): boolean {
    return frame in this.sheets[atlas].textures;
  }
}

export type AssetLoadState =
  | { status: 'idle' }
  | { status: 'loading'; progress: number }
  | { status: 'ready'; progress: 1; assets: GameAssets }
  | { status: 'error'; progress: number; message: string };

class AssetLoadError extends Error {
  constructor(
    message: string,
    readonly url: string | undefined,
  ) {
    super(message);
    this.name = 'AssetLoadError';
  }
}

/**
 * Loads every texture atlas once and keeps them in the PixiJS asset cache for the whole
 * session, so matches (and restarts) reuse the same GPU textures. Concurrent `load()` calls
 * share one in-flight promise, which also makes the loader safe under React Strict Mode.
 * A failed load leaves the cache clean for the failed URLs, so `retry()` only refetches
 * what is missing.
 */
export class GameAssetLoader {
  readonly state = new Store<AssetLoadState>({ status: 'idle' });
  private inflight: Promise<GameAssets> | null = null;

  load(): Promise<GameAssets> {
    // Sounds download in the background; they are optional and never block the match.
    audio.preload();
    const current = this.state.getSnapshot();
    if (current.status === 'ready') return Promise.resolve(current.assets);
    if (this.inflight) return this.inflight;

    this.inflight = this.run().finally(() => {
      this.inflight = null;
    });
    return this.inflight;
  }

  retry(): Promise<GameAssets> {
    return this.load();
  }

  private async run(): Promise<GameAssets> {
    const resolution = pickResolution(window.devicePixelRatio || 1);
    const urls = ATLAS_KEYS.map((key) => ATLAS_URLS[key][resolution]);
    let lastProgress = 0;
    let failedUrl: string | undefined;
    this.state.set({ status: 'loading', progress: 0 });

    try {
      const loaded = await Assets.load<Spritesheet>(urls, {
        onProgress: (progress) => {
          // Only publish visible changes (whole percents) to avoid needless React renders.
          const rounded = Math.floor(progress * 100) / 100;
          if (rounded > lastProgress) {
            lastProgress = rounded;
            this.state.set({ status: 'loading', progress: rounded });
          }
        },
        onError: (_error, asset) => {
          failedUrl = typeof asset === 'string' ? asset : asset.src;
        },
        strategy: 'retry',
        retryCount: 2,
        retryDelay: 300,
      });

      const sheets = {} as Record<AtlasKey, Spritesheet>;
      ATLAS_KEYS.forEach((key, i) => {
        const sheet = loaded[urls[i] ?? ''];
        if (!sheet?.textures) throw new AssetLoadError(`Atlas "${key}" did not load correctly.`, urls[i]);
        sheets[key] = sheet;
      });

      for (const key of ATLAS_KEYS) {
        const missing = REQUIRED_FRAMES[key].filter((frame) => !(frame in sheets[key].textures));
        if (missing.length > 0) {
          throw new AssetLoadError(`Atlas "${key}" is missing frames: ${missing.join(', ')}.`, ATLAS_URLS[key][resolution]);
        }
      }

      const assets = new GameAssets(resolution, sheets);
      this.state.set({ status: 'ready', progress: 1, assets });
      return assets;
    } catch (error: unknown) {
      const url = error instanceof AssetLoadError ? error.url : failedUrl;
      const file = url ? url.split('/').pop() : undefined;
      const message = file ? `Could not load game assets (${file}).` : 'Could not load game assets.';
      this.state.set({ status: 'error', progress: lastProgress, message });
      throw error instanceof Error ? error : new Error(message);
    }
  }
}

/** Session-wide loader instance. */
export const gameAssetLoader = new GameAssetLoader();
