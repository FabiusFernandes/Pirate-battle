import { Store } from '@/lib/store';
import { readJson, writeJson } from '@/lib/storage';

export const SOUND_NAMES = [
  'cannon_broadside',
  'cannon_fire_1',
  'cannon_fire_2',
  'cannon_fire_3',
  'cannonball_water_hit_1',
  'cannonball_water_hit_2',
  'game_complete',
  'game_over',
  'game_pause',
  'game_resume',
  'game_start',
  'health_low',
  'ocean_ambience_loop',
  'score_point',
  'ship_collision',
  'ship_explosion_1',
  'ship_explosion_2',
  'ship_sailing_loop',
  'ship_sinking',
  'ship_wood_hit_1',
  'ship_wood_hit_2',
  'time_warning',
  'ui_back',
  'ui_click',
  'ui_close',
  'ui_hover',
  'ui_open',
] as const;

export type SoundName = (typeof SOUND_NAMES)[number];

export interface PlayOptions {
  volume?: number;
  /** Playback rate (pitch); small random variations keep repeated sounds lively. */
  rate?: number;
}

export interface LoopHandle {
  setVolume(volume: number, rampSeconds?: number): void;
  stop(): void;
}

export interface AudioSettings {
  muted: boolean;
}

const SETTINGS_KEY = 'pirate-battle:audio';
/** `?audio=off` disables audio entirely: no sound files are requested (profiling, kiosks). */
const AUDIO_DISABLED = new URLSearchParams(window.location.search).get('audio') === 'off';
const MAX_VOICES_PER_SOUND = 4;
const SOUND_BASE = `${import.meta.env.BASE_URL}game/sounds/`;

/**
 * Sounds ship as base64 WAV inside JSON bundles (see scripts/prepare-assets.mjs): download
 * managers intercept requests for `.wav` files and take them away from the page, but they
 * never touch JSON. Effects load first; the long ambience loops come in a second bundle.
 */
const AMBIENCE_SOUNDS: ReadonlySet<SoundName> = new Set<SoundName>(['ocean_ambience_loop', 'ship_sailing_loop']);
const SOUND_BUNDLES: readonly { file: string; names: ReadonlySet<SoundName> }[] = [
  { file: 'effects.json', names: new Set(SOUND_NAMES.filter((n) => !AMBIENCE_SOUNDS.has(n))) },
  { file: 'ambience.json', names: AMBIENCE_SOUNDS },
];

type SoundBundleData = Partial<Record<string, string>>;

async function fetchBundle(bundle: { file: string }): Promise<SoundBundleData | null> {
  try {
    const response = await fetch(`${SOUND_BASE}${bundle.file}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const body: unknown = await response.json();
    const sounds = typeof body === 'object' && body !== null ? (body as { sounds?: unknown }).sounds : undefined;
    if (typeof sounds !== 'object' || sounds === null) throw new Error('malformed bundle');
    return sounds;
  } catch (error: unknown) {
    console.warn(`[audio] sound bundle "${bundle.file}" unavailable:`, error instanceof Error ? error.message : error);
    return null;
  }
}

function base64ToArrayBuffer(encoded: string): ArrayBuffer {
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

/**
 * Web Audio playback for the whole session. Sound files are fetched in the background and
 * decoded once the AudioContext exists (created on the first user gesture, as browsers
 * require). Audio is optional: missing or undecodable files are skipped with a warning and
 * never block the game.
 */
export class AudioManager {
  readonly settings: Store<AudioSettings>;
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private readonly raw = new Map<SoundName, Promise<ArrayBuffer | null>>();
  private readonly buffers = new Map<SoundName, AudioBuffer>();
  private readonly voices = new Map<SoundName, number>();
  private decoding: Promise<void> | null = null;

  constructor() {
    const stored = readJson(SETTINGS_KEY);
    const muted = typeof stored === 'object' && stored !== null && 'muted' in stored && stored.muted === true;
    this.settings = new Store<AudioSettings>({ muted });
  }

  get muted(): boolean {
    return this.settings.getSnapshot().muted;
  }

  setMuted(muted: boolean): void {
    this.settings.set({ muted });
    writeJson(SETTINGS_KEY, { muted });
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(muted ? 0 : 1, this.ctx.currentTime, 0.02);
  }

  toggleMuted(): void {
    this.setMuted(!this.muted);
  }

  /** Starts downloading every sound (no decoding yet). Safe to call repeatedly. */
  preload(): void {
    if (AUDIO_DISABLED || this.raw.size > 0) return;
    const bundles = SOUND_BUNDLES.map((bundle) => ({ bundle, data: fetchBundle(bundle) }));
    for (const name of SOUND_NAMES) {
      const { data } = bundles.find((b) => b.bundle.names.has(name)) ?? { data: Promise.resolve(null) };
      this.raw.set(
        name,
        data.then((sounds) => {
          const encoded = sounds?.[name];
          if (encoded === undefined) {
            if (sounds) console.warn(`[audio] "${name}" missing from its sound bundle`);
            return null;
          }
          return base64ToArrayBuffer(encoded);
        }),
      );
    }
  }

  /** Creates/resumes the AudioContext. Must be called from a user gesture handler. */
  unlock(): void {
    if (AUDIO_DISABLED) return;
    if (!this.ctx) {
      const Ctor = window.AudioContext as typeof AudioContext | undefined;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 1;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume().catch(() => undefined);
    this.decodeAll();
  }

  play(name: SoundName, options: PlayOptions = {}): void {
    const ctx = this.ctx;
    const buffer = this.buffers.get(name);
    if (!ctx || !this.master || !buffer || ctx.state !== 'running') return;
    const active = this.voices.get(name) ?? 0;
    if (active >= MAX_VOICES_PER_SOUND) return;

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = options.rate ?? 1;
    const gain = ctx.createGain();
    gain.gain.value = options.volume ?? 1;
    source.connect(gain).connect(this.master);
    this.voices.set(name, active + 1);
    source.onended = () => {
      this.voices.set(name, Math.max(0, (this.voices.get(name) ?? 1) - 1));
      gain.disconnect();
    };
    source.start();
  }

  /** Plays one of several variants, e.g. `cannon_fire_1..3`. */
  playAny(names: readonly SoundName[], options: PlayOptions = {}): void {
    const name = names[Math.floor(Math.random() * names.length)];
    if (name) this.play(name, { ...options, rate: (options.rate ?? 1) * (0.94 + Math.random() * 0.12) });
  }

  loop(name: SoundName, volume: number): LoopHandle {
    let source: AudioBufferSourceNode | null = null;
    let gain: GainNode | null = null;
    let stopped = false;
    let target = volume;

    const start = (): void => {
      const ctx = this.ctx;
      const buffer = this.buffers.get(name);
      if (stopped || source || !ctx || !this.master || !buffer) return;
      source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      gain = ctx.createGain();
      gain.gain.value = 0;
      gain.gain.setTargetAtTime(target, ctx.currentTime, 0.4);
      source.connect(gain).connect(this.master);
      source.start();
    };
    // The buffer may still be decoding: start now or as soon as it is ready (start is idempotent).
    start();
    void this.decoding?.then(start);

    return {
      setVolume: (v, ramp = 0.15) => {
        target = v;
        if (gain && this.ctx) gain.gain.setTargetAtTime(v, this.ctx.currentTime, ramp);
      },
      stop: () => {
        stopped = true;
        if (source && gain && this.ctx) {
          const s = source;
          const g = gain;
          g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.15);
          window.setTimeout(() => {
            try {
              s.stop();
            } catch {
              // Already stopped.
            }
            g.disconnect();
          }, 600);
        }
        source = null;
        gain = null;
      },
    };
  }

  private decodeAll(): void {
    if (this.decoding || !this.ctx) return;
    this.preload();
    const ctx = this.ctx;
    this.decoding = Promise.all(
      SOUND_NAMES.map(async (name) => {
        const data = await this.raw.get(name);
        if (!data) return;
        try {
          this.buffers.set(name, await ctx.decodeAudioData(data));
        } catch (error: unknown) {
          console.warn(`[audio] could not decode "${name}":`, error instanceof Error ? error.message : error);
        }
      }),
    ).then(() => undefined);
  }
}

export const audio = new AudioManager();

/** Browsers only allow audio after a user gesture: unlock on the first one. */
export function installAudioUnlock(): () => void {
  const unlock = (): void => {
    audio.unlock();
  };
  window.addEventListener('pointerdown', unlock, { capture: true });
  window.addEventListener('keydown', unlock, { capture: true });
  return () => {
    window.removeEventListener('pointerdown', unlock, { capture: true });
    window.removeEventListener('keydown', unlock, { capture: true });
  };
}
