import { useEffect, useRef, useState } from 'react';
import type { PauseReason } from '@/game/engine/GameSession';
import { MenuButton } from '../components/MenuButton';
import { ModalDialog } from '../components/ModalDialog';
import { SoundToggle } from '../components/SoundToggle';
import { OptionsForm } from '../options/OptionsForm';

const REASON_TEXT: Record<PauseReason, string> = {
  manual: 'Ready when you are.',
  blur: 'The game paused because the window lost focus.',
  hidden: 'The game paused while the tab was hidden.',
  orientation: 'The game paused while the device was in portrait.',
};

interface PauseDialogProps {
  reason: PauseReason;
  onResume: () => void;
  onExit: () => void;
}

export function PauseDialog({ reason, onResume, onExit }: PauseDialogProps) {
  const [view, setView] = useState<'menu' | 'options'>('menu');
  const resumeRef = useRef<HTMLButtonElement>(null);
  const optionsTitleRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (view === 'menu') resumeRef.current?.focus();
    else optionsTitleRef.current?.focus();
  }, [view]);

  return (
    <ModalDialog
      labelledBy={view === 'menu' ? 'pause-title' : 'pause-options-title'}
      describedBy={view === 'menu' ? 'pause-reason' : undefined}
      onEscape={
        view === 'menu'
          ? onResume
          : () => {
              setView('menu');
            }
      }
      testId="pause-dialog"
    >
      {view === 'menu' ? (
        <>
          <h2 id="pause-title" className="panel-title">
            Paused
          </h2>
          <p id="pause-reason" className="dialog-text">
            {REASON_TEXT[reason]}
          </p>
          <div className="stack">
            <MenuButton ref={resumeRef} onClick={onResume} data-testid="pause-resume">
              Resume
            </MenuButton>
            <MenuButton
              onClick={() => {
                setView('options');
              }}
              data-testid="pause-options"
            >
              Options
            </MenuButton>
            <MenuButton onClick={onExit} data-testid="pause-exit">
              Main menu
            </MenuButton>
            <SoundToggle />
          </div>
          <p className="dialog-hint">Leaving ends this battle without recording it.</p>
        </>
      ) : (
        <>
          <h2 id="pause-options-title" className="panel-title" ref={optionsTitleRef} tabIndex={-1}>
            Options
          </h2>
          <OptionsForm note="Changes apply to your next battle; this one keeps its settings." />
          <MenuButton
            onClick={() => {
              setView('menu');
            }}
            data-testid="pause-options-back"
          >
            Back
          </MenuButton>
        </>
      )}
    </ModalDialog>
  );
}
