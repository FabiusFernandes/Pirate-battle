import { audio } from '@/game/audio/AudioManager';
import { useStore } from '@/lib/store';
import { MenuButton } from './MenuButton';

export function SoundToggle() {
  const { muted } = useStore(audio.settings);
  return (
    <MenuButton
      variant="secondary"
      size="small"
      aria-pressed={!muted}
      onClick={() => {
        audio.toggleMuted();
      }}
      data-testid="sound-toggle"
    >
      Sound: {muted ? 'Off' : 'On'}
    </MenuButton>
  );
}
