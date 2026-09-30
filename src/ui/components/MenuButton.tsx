import type { ComponentPropsWithRef } from 'react';
import { audio } from '@/game/audio/AudioManager';

interface MenuButtonProps extends ComponentPropsWithRef<'button'> {
  variant?: 'primary' | 'secondary';
  size?: 'large' | 'small';
}

/** Button skinned with `button_primary_*` / `button_secondary_*` from the UI atlas. */
export function MenuButton({ variant = 'primary', size = 'large', className, type = 'button', onClick, onPointerEnter, ...rest }: MenuButtonProps) {
  return (
    <button
      type={type}
      {...rest}
      onClick={(event) => {
        audio.play('ui_click', { volume: 0.6 });
        onClick?.(event);
      }}
      onPointerEnter={(event) => {
        if (event.pointerType === 'mouse' && !event.currentTarget.disabled) audio.play('ui_hover', { volume: 0.25 });
        onPointerEnter?.(event);
      }}
      className={['menu-button', `menu-button--${variant}`, `menu-button--${size}`, className].filter(Boolean).join(' ')}
    />
  );
}
