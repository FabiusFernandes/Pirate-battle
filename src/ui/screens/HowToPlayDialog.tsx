import { useEffect, useRef } from 'react';
import { MenuButton } from '../components/MenuButton';
import { ModalDialog } from '../components/ModalDialog';
import { ControlsHelp } from '../components/ControlsHelp';

export function HowToPlayDialog({ onClose }: { onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  return (
    <ModalDialog labelledBy="howto-title" describedBy="howto-rules" onEscape={onClose} className="modal--wide" testId="howto-dialog">
      <h2 id="howto-title" className="panel-title">
        How to play
      </h2>
      <p id="howto-rules" className="dialog-text">
        Sink enemy ships before the time runs out. Every ship you sink is worth one point. Chasers ram you and explode;
        Shooters keep their distance and fire. Islands block ships and cannonballs.
      </p>
      <ControlsHelp />
      <MenuButton ref={closeRef} onClick={onClose} data-testid="howto-close">
        Got it
      </MenuButton>
    </ModalDialog>
  );
}
