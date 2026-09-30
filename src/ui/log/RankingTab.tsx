import { useId, useState } from 'react';
import type { MatchSetup } from '@/api/contracts';
import { useRanking } from '@/api/queries';
import { SESSION_TIME_LIMITS, SPAWN_INTERVAL_LIMITS } from '@/game/config/gameConfig';
import { playerOptions } from '@/game/config/playerOptions';
import { playerProfile } from '@/game/profile/playerProfile';
import { useStore } from '@/lib/store';
import { END_REASON_LABEL, formatClock } from '../format';
import { formatPlayed, formatPlayedLong, formatRank } from './format';
import { Pagination } from './Pagination';
import { EmptyState, ErrorState, LoadingRows, RefreshIndicator } from './QueryStates';

function range(min: number, max: number, step: number): number[] {
  const out: number[] = [];
  for (let v = min; v <= max + 1e-9; v += step) out.push(Math.round(v * 100) / 100);
  return out;
}

const SESSION_VALUES = range(SESSION_TIME_LIMITS.min, SESSION_TIME_LIMITS.max, SESSION_TIME_LIMITS.step);
const SPAWN_VALUES = range(SPAWN_INTERVAL_LIMITS.min, SPAWN_INTERVAL_LIMITS.max, SPAWN_INTERVAL_LIMITS.step);

/** Ranking of matches played with one setup (defaults to the player's current options). */
export function RankingTab() {
  const id = useId();
  const profile = useStore(playerProfile);
  const [setup, setSetup] = useState<MatchSetup>(() => {
    const o = playerOptions.getSnapshot();
    return { sessionTime: o.sessionTime, spawnInterval: o.spawnInterval };
  });
  const [page, setPage] = useState(1);
  const query = useRanking(setup, page);
  const data = query.data;

  const changeSetup = (patch: Partial<MatchSetup>) => {
    setSetup((s) => ({ ...s, ...patch }));
    setPage(1);
  };

  return (
    <div className="log-tab" data-testid="ranking-tab">
      <div className="log-filters">
        <label htmlFor={`${id}-session`}>Battle length</label>
        <select
          id={`${id}-session`}
          value={setup.sessionTime}
          onChange={(e) => {
            changeSetup({ sessionTime: Number(e.target.value) });
          }}
          data-testid="ranking-session"
        >
          {SESSION_VALUES.map((v) => (
            <option key={v} value={v}>
              {v} s
            </option>
          ))}
        </select>
        <label htmlFor={`${id}-spawn`}>Spawn interval</label>
        <select
          id={`${id}-spawn`}
          value={setup.spawnInterval}
          onChange={(e) => {
            changeSetup({ spawnInterval: Number(e.target.value) });
          }}
          data-testid="ranking-spawn"
        >
          {SPAWN_VALUES.map((v) => (
            <option key={v} value={v}>
              {v} s
            </option>
          ))}
        </select>
      </div>
      <p className="log-caption" id={`${id}-caption`}>
        {setup.sessionTime} second battles · {setup.spawnInterval} second spawn interval
      </p>

      {query.isPending ? (
        <LoadingRows columns={4} label="ranking" />
      ) : query.isError && !data ? (
        <ErrorState
          what="ranking"
          error={query.error}
          retrying={query.isFetching}
          onRetry={() => {
            void query.refetch();
          }}
        />
      ) : data && data.totalItems === 0 ? (
        <EmptyState message="No battles recorded for this setup yet. Be the first!" />
      ) : data ? (
        <>
          <table className="log-table" aria-describedby={`${id}-caption`} aria-busy={query.isPlaceholderData} data-testid="ranking-table">
            <thead>
              <tr>
                <th scope="col">Rank</th>
                <th scope="col">Captain</th>
                <th scope="col">Points</th>
                <th scope="col">Played</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((entry) => {
                const mine = entry.playerId === profile.id;
                return (
                  <tr key={entry.matchId} className={mine ? 'log-row--mine' : undefined} data-testid="ranking-row">
                    <td className="log-rank">{formatRank(entry.rank)}</td>
                    <th scope="row">
                      {entry.playerName}
                      {mine && <span className="badge">You</span>}
                      <span className="visually-hidden">
                        , {END_REASON_LABEL[entry.reason]} after {formatClock(entry.duration)}
                      </span>
                    </th>
                    <td className="log-points">{entry.score}</td>
                    <td>
                      <time dateTime={entry.endedAt} title={formatPlayedLong(entry.endedAt)}>
                        {formatPlayed(entry.endedAt)}
                      </time>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <Pagination page={data.page} totalPages={data.totalPages} onChange={setPage} label="Ranking" />
        </>
      ) : null}
      {data && (
        <RefreshIndicator
          fetching={query.isFetching && !query.isPending}
          error={query.isError ? query.error : null}
          onRetry={() => {
            void query.refetch();
          }}
        />
      )}
    </div>
  );
}
