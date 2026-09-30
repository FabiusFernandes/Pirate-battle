import { useEffect, useRef } from 'react';
import type { MatchResult } from '@/game/engine/GameSession';
import { MenuButton } from '../components/MenuButton';
import { ModalDialog } from '../components/ModalDialog';
import { resultTitle } from '../format';
import { RegistrationStatus } from '../results/RegistrationStatus';
import { ResultSummary } from '../results/ResultSummary';

interface ResultDialogProps {
  result: MatchResult;
  onPlayAgain: () => void;
  onExit: () => void;
}

export function ResultDialog({ result, onPlayAgain, onExit }: ResultDialogProps) {
  const playRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    playRef.current?.focus();
  }, []);

  return (
    <ModalDialog labelledBy="result-title" describedBy="result-summary" testId="result-dialog">
      <h2 id="result-title" className="panel-title">
        {resultTitle(result)}
      </h2>
      <ResultSummary result={result} summaryId="result-summary" />
      <RegistrationStatus matchId={result.matchId} />
      <div className="stack">
        <MenuButton ref={playRef} onClick={onPlayAgain} data-testid="result-play-again">
          Play again
        </MenuButton>
        <MenuButton onClick={onExit} data-testid="result-menu">
          Main menu
        </MenuButton>
      </div>
    </ModalDialog>
  );
}
