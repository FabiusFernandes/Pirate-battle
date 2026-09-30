import type { ComponentPropsWithRef } from 'react';
import { uiImageUrl } from '@/game/assets/manifest';
import { audio } from '@/game/audio/AudioManager';

export type ControlIcon =
  | 'icon_close'
  | 'icon_fire_front'
  | 'icon_fire_left'
  | 'icon_fire_right'
  | 'icon_forward'
  | 'icon_home'
  | 'icon_minus'
  | 'icon_pause'
  | 'icon_play'
  | 'icon_plus'
  | 'icon_restart'
  | 'icon_settings'
  | 'icon_turn_left'
  | 'icon_turn_right';

interface RoundButtonProps extends Omit<ComponentPropsWithRef<'button'>, 'children'> {
  icon: ControlIcon;
  /** Accessible name; also used as tooltip. */
  label: string;
  size?: 'normal' | 'large';
}

/** Circular brass button (`button_round_*`) with an icon from the controls set. */
export function RoundButton({ icon, label, size = 'normal', className, type = 'button', onClick, ...rest }: RoundButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      {...rest}
      onClick={(event) => {
        audio.play('ui_click', { volume: 0.6 });
        onClick?.(event);
      }}
      className={['round-button', `round-button--${size}`, className].filter(Boolean).join(' ')}
    >
      <img src={uiImageUrl(`controls/${icon}.png`)} alt="" aria-hidden="true" draggable={false} />
    </button>
  );
}
