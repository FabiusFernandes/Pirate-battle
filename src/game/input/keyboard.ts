import type { GameAction, InputState } from './InputState';

/** Physical key codes (layout independent) mapped to game actions. */
export const KEY_BINDINGS: Readonly<Record<string, GameAction>> = {
  KeyW: 'forward',
  ArrowUp: 'forward',
  KeyA: 'turnLeft',
  ArrowLeft: 'turnLeft',
  KeyD: 'turnRight',
  ArrowRight: 'turnRight',
  Space: 'fireFront',
  KeyK: 'fireFront',
  KeyQ: 'fireLeft',
  KeyJ: 'fireLeft',
  KeyE: 'fireRight',
  KeyL: 'fireRight',
};

export const PAUSE_KEYS: readonly string[] = ['Escape', 'KeyP'];
export const MUTE_KEY = 'KeyM';

/** Human-readable bindings, shown in the menu and in the in-game help. */
export const CONTROL_HINTS: readonly { action: string; keys: string; touch: string }[] = [
  { action: 'Sail forward', keys: 'W / ↑', touch: 'Forward button' },
  { action: 'Turn left / right', keys: 'A D / ← →', touch: 'Turn buttons' },
  { action: 'Front cannon', keys: 'Space / K', touch: 'Front fire button' },
  { action: 'Left broadside', keys: 'Q / J', touch: 'Left fire button' },
  { action: 'Right broadside', keys: 'E / L', touch: 'Right fire button' },
  { action: 'Pause', keys: 'Esc / P', touch: 'Pause button' },
  { action: 'Sound on / off', keys: 'M', touch: 'Pause menu' },
];

export interface KeyboardOptions {
  /** Whether game keys should be captured right now (only while the match is running). */
  isActive: () => boolean;
  onPauseKey: () => void;
  onMuteKey: () => void;
}

/**
 * Captures game keys on `window` while the gameplay context is active. Outside of it (menus,
 * pause dialog, result) keys are left alone so the page and dialogs keep normal keyboard
 * behaviour. Auto-repeat is ignored: a key must be freshly pressed after a pause.
 */
export function attachKeyboard(input: InputState, options: KeyboardOptions): () => void {
  const onKeyDown = (event: KeyboardEvent): void => {
    if (!options.isActive() || event.altKey || event.ctrlKey || event.metaKey) return;
    if (PAUSE_KEYS.includes(event.code)) {
      event.preventDefault();
      if (!event.repeat) options.onPauseKey();
      return;
    }
    if (event.code === MUTE_KEY) {
      event.preventDefault();
      if (!event.repeat) options.onMuteKey();
      return;
    }
    const action = KEY_BINDINGS[event.code];
    if (!action) return;
    event.preventDefault();
    if (event.repeat) return;
    input.press(action, `key:${event.code}`);
  };

  const onKeyUp = (event: KeyboardEvent): void => {
    const action = KEY_BINDINGS[event.code];
    if (!action) return;
    input.release(action, `key:${event.code}`);
    if (options.isActive()) event.preventDefault();
  };

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  return () => {
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
  };
}
