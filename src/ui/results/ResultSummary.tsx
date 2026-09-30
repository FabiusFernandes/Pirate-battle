import type { MatchResult } from '@/game/engine/GameSession';
import { END_REASON_LABEL, formatClock, formatDurationLong } from '../format';

/** Score, time played and end reason. Shared by the in-game result dialog and the result screen. */
export function ResultSummary({ result, summaryId }: { result: MatchResult; summaryId: string }) {
  return (
    <>
      <p className="result-score" data-testid="result-score">
        {result.score}
      </p>
      <p id={summaryId} className="result-summary">
        <span className="visually-hidden">
          {result.score} {result.score === 1 ? 'point' : 'points'}, played {formatDurationLong(result.duration)},{' '}
          {END_REASON_LABEL[result.reason]}.
        </span>
        <span aria-hidden="true">
          Points · <span data-testid="result-duration">{formatClock(result.duration)}</span> ·{' '}
          <span data-testid="result-reason">{END_REASON_LABEL[result.reason]}</span>
        </span>
      </p>
      <p className="result-config">
        {result.sessionTime} s battle · {result.spawnInterval} s spawn interval
      </p>
    </>
  );
}
