import { useCallback, useState, type ReactNode } from 'react';
import { registrationQueue, toRecordInput } from '@/api/registrationQueue';
import type { MatchResult } from '@/game/engine/GameSession';
import { playerProfile } from '@/game/profile/playerProfile';
import { lastResult, saveLastResult } from '@/game/results/lastResult';
import { readSession, writeSession } from '@/lib/storage';
import { useStore } from '@/lib/store';
import { GameScreen } from './ui/screens/GameScreen';
import { MainMenu } from './ui/screens/MainMenu';
import { OptionsScreen } from './ui/screens/OptionsScreen';
import { ResultScreen } from './ui/screens/ResultScreen';
import { NetworkPanel } from './ui/dev/NetworkPanel';
import { CaptainsLog, type LogTab } from './ui/log/CaptainsLog';

export type Screen =
  | { name: 'menu' }
  | { name: 'options' }
  | { name: 'game'; matchKey: number }
  | { name: 'result' }
  | { name: 'log'; tab: LogTab };

/** Which screen to restore after a refresh. A battle in progress is never restored (it is abandoned). */
const SCREEN_KEY = 'pirate-battle:screen';

function initialScreen(): Screen {
  const saved = readSession(SCREEN_KEY);
  if (saved === 'result' && lastResult.getSnapshot()) return { name: 'result' };
  if (saved === 'options') return { name: 'options' };
  return { name: 'menu' };
}

export function App() {
  const [screen, setScreen] = useState<Screen>(initialScreen);
  const [networkOpen, setNetworkOpen] = useState(false);
  const last = useStore(lastResult);

  const go = useCallback((next: Screen) => {
    writeSession(SCREEN_KEY, next.name === 'result' || next.name === 'options' ? next.name : null);
    setScreen(next);
  }, []);

  const play = useCallback(() => {
    go({ name: 'game', matchKey: Date.now() });
  }, [go]);
  const goToMenu = useCallback(() => {
    go({ name: 'menu' });
  }, [go]);
  const goToOptions = useCallback(() => {
    go({ name: 'options' });
  }, [go]);

  const openLog = useCallback(
    (tab: LogTab) => {
      go({ name: 'log', tab });
    },
    [go],
  );
  const openNetwork = useCallback(() => {
    setNetworkOpen(true);
  }, []);

  const onMatchEnd = useCallback((result: MatchResult) => {
    saveLastResult(result);
    // Queue first: the registration survives a refresh even before the first request is sent.
    registrationQueue.enqueue(toRecordInput(result, playerProfile.getSnapshot()));
    // The result dialog is shown over the arena; a refresh from here restores the result screen.
    writeSession(SCREEN_KEY, 'result');
  }, []);

  const menu = <MainMenu onPlay={play} onOptions={goToOptions} onLog={openLog} onNetwork={openNetwork} />;
  let content: ReactNode;
  switch (screen.name) {
    case 'menu':
      content = menu;
      break;
    case 'options':
      content = <OptionsScreen onBack={goToMenu} />;
      break;
    case 'game':
      content = <GameScreen key={screen.matchKey} onExit={goToMenu} onPlayAgain={play} onMatchEnd={onMatchEnd} />;
      break;
    case 'result':
      content = last ? <ResultScreen result={last} onPlayAgain={play} onMenu={goToMenu} /> : menu;
      break;
    case 'log':
      content = (
        <CaptainsLog
          tab={screen.tab}
          onTabChange={(tab) => {
            go({ name: 'log', tab });
          }}
          onBack={goToMenu}
          onOpenNetwork={openNetwork}
        />
      );
      break;
  }

  return (
    <>
      {content}
      {networkOpen && screen.name !== 'game' && (
        <NetworkPanel
          onClose={() => {
            setNetworkOpen(false);
          }}
        />
      )}
    </>
  );
}
