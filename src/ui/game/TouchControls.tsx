import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react';
import type { GameAction, InputState } from '@/game/input/InputState';
import type { ControlIcon } from '../components/RoundButton';
import { uiImageUrl } from '@/game/assets/manifest';

interface ControlDef {
  action: GameAction;
  icon: ControlIcon;
  label: string;
}

const MOVE_CONTROLS: readonly ControlDef[] = [
  { action: 'turnLeft', icon: 'icon_turn_left', label: 'Turn left' },
  { action: 'forward', icon: 'icon_forward', label: 'Sail forward' },
  { action: 'turnRight', icon: 'icon_turn_right', label: 'Turn right' },
];

const FIRE_CONTROLS: readonly ControlDef[] = [
  { action: 'fireLeft', icon: 'icon_fire_left', label: 'Fire left broadside' },
  { action: 'fireFront', icon: 'icon_fire_front', label: 'Fire front cannon' },
  { action: 'fireRight', icon: 'icon_fire_right', label: 'Fire right broadside' },
];

/**
 * On-screen controls. Each pointer is its own input source, so several buttons can be held
 * at once with different fingers (sail + turn + fire). Pointer capture keeps a press alive
 * while the finger slides slightly off the button.
 */
export function TouchControls({ input, disabled }: { input: InputState; disabled: boolean }) {
  const bind = (action: GameAction) => ({
    onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (disabled) return;
      event.preventDefault();
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // Synthetic pointers (assistive tech, automation) may not support capture.
      }
      event.currentTarget.dataset.active = 'true';
      input.press(action, `pointer:${event.pointerId}`);
    },
    onPointerUp: (event: ReactPointerEvent<HTMLButtonElement>) => {
      release(event);
    },
    onPointerCancel: (event: ReactPointerEvent<HTMLButtonElement>) => {
      release(event);
    },
    onLostPointerCapture: (event: ReactPointerEvent<HTMLButtonElement>) => {
      release(event);
    },
    onContextMenu: (event: ReactMouseEvent) => {
      event.preventDefault();
    },
  });

  const release = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    delete event.currentTarget.dataset.active;
    input.releaseSource(`pointer:${event.pointerId}`);
  };

  const renderButton = (control: ControlDef) => (
    <button
      key={control.action}
      type="button"
      className="round-button round-button--large touch-button"
      aria-label={control.label}
      // Keyboard players use the keyboard bindings; these buttons are pointer-only.
      tabIndex={-1}
      disabled={disabled}
      data-testid={`touch-${control.action}`}
      {...bind(control.action)}
    >
      <img src={uiImageUrl(`controls/${control.icon}.png`)} alt="" aria-hidden="true" draggable={false} />
    </button>
  );

  return (
    <div className="touch-controls" data-testid="touch-controls">
      <div className="touch-controls__group touch-controls__group--move" role="group" aria-label="Movement">
        {MOVE_CONTROLS.map(renderButton)}
      </div>
      <div className="touch-controls__group touch-controls__group--fire" role="group" aria-label="Cannons">
        {FIRE_CONTROLS.map(renderButton)}
      </div>
    </div>
  );
}
