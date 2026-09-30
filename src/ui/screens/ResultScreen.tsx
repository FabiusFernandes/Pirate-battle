import { useEffect, useRef } from 'react';
import type { MatchResult } from '@/game/engine/GameSession';
import { MenuButton } from '../components/MenuButton';
import { Panel } from '../components/Panel';
import { resultTitle } from '../format';
import { RegistrationStatus } from '../results/RegistrationStatus';
import { ResultSummary } from '../results/ResultSummary';

interface ResultScreenProps {
  result: MatchResult;
  onPlayAgain: () => void;
  onMenu: () => void;
}

/** Standalone result, restored from local storage (e.g. after refreshing on the result dialog). */
export function ResultScreen({ result, onPlayAgain, onMenu }: ResultScreenProps) {
  const playRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    playRef.current?.focus();
  }, []);

  return (
    <main className="screen screen--menu" aria-labelledby="result-screen-title" data-testid="result-screen">
      <Panel>
        <h1 id="result-screen-title" className="panel-title">
          {resultTitle(result)}
        </h1>
        <ResultSummary result={result} summaryId="result-screen-summary" />
        <RegistrationStatus matchId={result.matchId} />
        <div className="stack">
          <MenuButton ref={playRef} onClick={onPlayAgain} data-testid="result-play-again">
            Play again
          </MenuButton>
          <MenuButton onClick={onMenu} data-testid="result-menu">
            Main menu
          </MenuButton>
        </div>
      </Panel>
    </main>
  );
}
