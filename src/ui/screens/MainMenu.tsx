import { useEffect, useRef, useState } from 'react';
import { uiImageUrl } from '@/game/assets/manifest';
import { lastResult } from '@/game/results/lastResult';
import { useStore } from '@/lib/store';
import { MenuButton } from '../components/MenuButton';
import { Panel } from '../components/Panel';
import { END_REASON_LABEL, formatClock } from '../format';
import type { LogTab } from '../log/CaptainsLog';
import { HowToPlayDialog } from './HowToPlayDialog';

interface MainMenuProps {
  onPlay: () => void;
  onOptions: () => void;
  onLog: (tab: LogTab) => void;
  onNetwork: () => void;
}

export function MainMenu({ onPlay, onOptions, onLog, onNetwork }: MainMenuProps) {
  const playRef = useRef<HTMLButtonElement>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const last = useStore(lastResult);

  useEffect(() => {
    playRef.current?.focus();
  }, []);

  return (
    <main className="screen screen--menu" aria-labelledby="menu-title">
      <Panel className="main-menu">
        <h1 id="menu-title" className="main-menu__title">
          <img src={uiImageUrl('menu/title_pirate_battle.png')} alt="Pirate Battle" width={384} height={128} />
        </h1>
        <p className="main-menu__tagline">Set sail. Take command.</p>
        <nav className="main-menu__actions" aria-label="Main menu">
          <MenuButton ref={playRef} onClick={onPlay} data-testid="menu-play">
            Play
          </MenuButton>
          <MenuButton onClick={onOptions} data-testid="menu-options">
            Options
          </MenuButton>
          <MenuButton
            variant="secondary"
            size="small"
            onClick={() => {
              setHelpOpen(true);
            }}
            aria-haspopup="dialog"
            data-testid="menu-howto"
          >
            How to play
          </MenuButton>
        </nav>
        <p className="main-menu__hint">
          <kbd>W</kbd> sail · <kbd>A</kbd>/<kbd>D</kbd> turn · <kbd>Space</kbd> fire · <kbd>Q</kbd>/<kbd>E</kbd> broadsides
        </p>
        <div className="main-menu__log">
          <MenuButton
            variant="secondary"
            size="small"
            onClick={() => {
              onLog('ranking');
            }}
            data-testid="menu-ranking"
          >
            Ranking
          </MenuButton>
          <MenuButton
            variant="secondary"
            size="small"
            onClick={() => {
              onLog('history');
            }}
            data-testid="menu-history"
          >
            Match history
          </MenuButton>
        </div>
        {last && (
          <p className="main-menu__last" data-testid="menu-last-result">
            Last battle: <strong>{last.score}</strong> {last.score === 1 ? 'point' : 'points'} · {formatClock(last.duration)} ·{' '}
            {END_REASON_LABEL[last.reason]}
          </p>
        )}
        <button type="button" className="link-button main-menu__network" onClick={onNetwork} data-testid="open-network">
          Mock API scenarios
        </button>
      </Panel>
      {helpOpen && (
        <HowToPlayDialog
          onClose={() => {
            setHelpOpen(false);
          }}
        />
      )}
    </main>
  );
}
