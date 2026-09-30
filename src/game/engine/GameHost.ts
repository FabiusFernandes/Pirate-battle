import { Application, Container, type Ticker } from 'pixi.js';
import type { GameAssets } from '@/game/assets/GameAssets';
import { ArenaRenderer } from '@/game/render/ArenaRenderer';
import { ARENA_MAP, arenaSize } from '@/game/world/arenaMap';
import { Store } from '@/lib/store';
import type { GameSession } from './GameSession';
import { Viewport, type ViewportRect } from './Viewport';

const MAX_RESOLUTION = 2;
const LETTERBOX_COLOR = 0x10202f;

export interface GameHostOptions {
  container: HTMLElement;
  assets: GameAssets;
  session: GameSession;
  /**
   * When true the host never advances the simulation on its own: the session is driven by an
   * external clock (tests) and the host renders only on request.
   */
  manualClock?: boolean;
}

function currentResolution(): number {
  return Math.min(window.devicePixelRatio || 1, MAX_RESOLUTION);
}

function sameRect(a: ViewportRect, b: ViewportRect): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height && a.scale === b.scale;
}

/**
 * Owns the PixiJS application for one mounted match: canvas creation, frame loop, resizing,
 * pixel density and teardown. Construction is synchronous; `start()` performs the async
 * renderer init and tolerates `destroy()` being called before it finishes, which is exactly
 * what React Strict Mode does (mount → unmount → mount).
 */
export class GameHost {
  readonly viewport: Viewport;
  /** Arena rectangle in container CSS pixels; lets the DOM HUD align with the canvas. */
  readonly viewportStore: Store<ViewportRect>;

  private readonly container: HTMLElement;
  private readonly assets: GameAssets;
  private readonly session: GameSession;
  private readonly manualClock: boolean;
  private app: Application | null = null;
  private world: Container | null = null;
  private arena: ArenaRenderer | null = null;
  private destroyed = false;
  private started = false;
  private renderQueued = false;
  private readonly cleanups: (() => void)[] = [];

  constructor(options: GameHostOptions) {
    this.container = options.container;
    this.assets = options.assets;
    this.session = options.session;
    this.manualClock = options.manualClock ?? false;
    const { width, height } = arenaSize(ARENA_MAP);
    this.viewport = new Viewport(width, height);
    this.viewportStore = new Store(this.viewport.current, sameRect);
  }

  get isDestroyed(): boolean {
    return this.destroyed;
  }

  get isRendering(): boolean {
    return this.app !== null;
  }

  /** Number of display objects on stage (profiling / leak checks). */
  get renderableCount(): number {
    let count = 0;
    const walk = (node: Container): void => {
      count += 1;
      for (const child of node.children) walk(child);
    };
    if (this.app) walk(this.app.stage);
    return count;
  }

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;

    const app = new Application();
    await app.init({
      width: Math.max(1, this.container.clientWidth),
      height: Math.max(1, this.container.clientHeight),
      resolution: currentResolution(),
      autoDensity: true,
      // Everything on stage is a textured sprite; MSAA would only cost fill rate.
      antialias: false,
      background: LETTERBOX_COLOR,
      preference: 'webgl',
      autoStart: false,
      sharedTicker: false,
    });

    if (this.destroyed) {
      // Unmounted while the renderer was initialising (e.g. Strict Mode double effect).
      app.destroy({ removeView: true }, { children: true });
      return;
    }

    this.app = app;
    app.canvas.classList.add('game-canvas');
    app.canvas.setAttribute('aria-hidden', 'true');
    this.container.appendChild(app.canvas);

    // No mask: ships are clamped inside the arena and projectiles are removed at its border,
    // so nothing meaningful is drawn over the letterbox (and stencil masks are not free).
    const world = new Container({ label: 'world' });
    this.world = world;
    app.stage.addChild(world);

    // The camera holds everything that moves together under screen shake.
    const camera = new Container({ label: 'camera' });
    world.addChild(camera);
    this.arena = new ArenaRenderer(this.assets, ARENA_MAP, app.renderer);
    camera.addChild(this.arena.view);
    this.session.attachRenderer(this.assets, camera, camera);
    this.session.requestRender = this.queueRender;

    this.observeSize();
    this.observePixelRatio();
    this.resize();

    if (this.manualClock) {
      // The application's ticker would render every frame; in manual mode we render on demand.
      app.ticker.stop();
    } else {
      app.ticker.add(this.onTick);
      app.ticker.start();
    }
    this.session.start();
    app.render();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    for (const cleanup of this.cleanups.splice(0)) cleanup();

    const app = this.app;
    this.app = null;
    if (!app) return; // `start()` will dispose the half-initialised app.

    app.ticker.remove(this.onTick);
    app.ticker.stop();
    // Children first: the session's layers live inside the stage we are about to destroy.
    this.session.detachRenderer();
    this.arena?.destroy();
    this.arena = null;
    this.world = null;
    // Display objects are destroyed; shared textures stay in the asset cache for reuse.
    app.destroy({ removeView: true }, { children: true, texture: false, textureSource: false });
  }

  /** World coordinates → page (client) coordinates, e.g. to aim pointer events in tests. */
  worldToClient(x: number, y: number): { x: number; y: number } {
    const bounds = this.container.getBoundingClientRect();
    const p = this.viewport.worldToScreen(x, y);
    return { x: bounds.left + p.x, y: bounds.top + p.y };
  }

  private readonly onTick = (ticker: Ticker): void => {
    this.session.frame(ticker.deltaMS / 1000);
  };

  /** Coalesces render requests (manual clock, pause) into one render per animation frame. */
  private readonly queueRender = (): void => {
    if (!this.manualClock || this.renderQueued) return;
    this.renderQueued = true;
    requestAnimationFrame(() => {
      this.renderQueued = false;
      this.app?.render();
    });
  };

  private resize(): void {
    const app = this.app;
    const world = this.world;
    if (!app || !world) return;
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    app.renderer.resize(width, height, currentResolution());
    const rect = this.viewport.fit(width, height);
    world.position.set(rect.x, rect.y);
    world.scale.set(rect.scale);
    this.viewportStore.set(rect);
    app.render();
  }

  private observeSize(): void {
    const observer = new ResizeObserver(() => {
      this.resize();
    });
    observer.observe(this.container);
    this.cleanups.push(() => {
      observer.disconnect();
    });
  }

  /** Re-renders at the new density when the window moves to a screen with another DPR. */
  private observePixelRatio(): void {
    let query: MediaQueryList | null = null;
    const onChange = (): void => {
      this.resize();
      listen();
    };
    const listen = (): void => {
      query?.removeEventListener('change', onChange);
      query = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
      query.addEventListener('change', onChange);
    };
    listen();
    this.cleanups.push(() => {
      query?.removeEventListener('change', onChange);
    });
  }
}
