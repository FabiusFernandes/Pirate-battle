import { useEffect, useRef } from 'react';
import { MenuButton } from '../components/MenuButton';
import { Panel } from '../components/Panel';
import { SoundToggle } from '../components/SoundToggle';
import { OptionsForm } from '../options/OptionsForm';

export function OptionsScreen({ onBack }: { onBack: () => void }) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <main className="screen screen--menu" aria-labelledby="options-title">
      <Panel className="options-panel">
        <h1 id="options-title" className="panel-title" ref={headingRef} tabIndex={-1}>
          Options
        </h1>
        <OptionsForm />
        <SoundToggle />
        <MenuButton onClick={onBack} data-testid="options-back">
          Main menu
        </MenuButton>
      </Panel>
    </main>
  );
}
