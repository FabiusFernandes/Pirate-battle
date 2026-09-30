import { useId, useState } from 'react';
import { useHistory } from '@/api/queries';
import { registrationQueue } from '@/api/registrationQueue';
import { playerProfile } from '@/game/profile/playerProfile';
import { useStore } from '@/lib/store';
import { END_REASON_LABEL, formatClock } from '../format';
import { formatPlayed, formatPlayedLong } from './format';
import { Pagination } from './Pagination';
import { EmptyState, ErrorState, LoadingRows, RefreshIndicator } from './QueryStates';

const STATUS_LABEL = {
  pending: 'Waiting to send',
  submitting: 'Sending…',
  failed: 'Not recorded yet',
  confirmed: 'Recorded',
} as const;

/** The player's own matches, newest first, with local not-yet-recorded matches on top. */
export function HistoryTab() {
  const id = useId();
  const profile = useStore(playerProfile);
  const [page, setPage] = useState(1);
  const query = useHistory(profile.id, page);
  const data = query.data;
  useStore(registrationQueue.store);
  const unconfirmed = registrationQueue.unconfirmed();

  return (
    <div className="log-tab" data-testid="history-tab">
      <p className="log-caption" id={`${id}-caption`}>
        Battles of {profile.name}
      </p>

      {unconfirmed.length > 0 && (
        <section className="log-pending" aria-label="Battles not recorded yet" data-testid="history-pending">
          <ul>
            {unconfirmed.map((entry) => (
              <li key={entry.matchId} data-testid="pending-row" data-status={entry.status}>
                <span>
                  <time dateTime={entry.record.endedAt}>{formatPlayed(entry.record.endedAt)}</time> · {entry.record.score} pts ·{' '}
                  {formatClock(entry.record.duration)}
                </span>
                <span className={`status-pill status-pill--${entry.status}`}>{STATUS_LABEL[entry.status]}</span>
                {entry.status === 'failed' && (
                  <button
                    type="button"
                    className="link-button"
                    onClick={() => {
                      registrationQueue.retry(entry.matchId);
                    }}
                    data-testid="pending-retry"
                  >
                    Retry
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {query.isPending ? (
        <LoadingRows columns={5} label="match history" />
      ) : query.isError && !data ? (
        <ErrorState
          what="match history"
          error={query.error}
          retrying={query.isFetching}
          onRetry={() => {
            void query.refetch();
          }}
        />
      ) : data && data.totalItems === 0 ? (
        <EmptyState message="No recorded battles yet. Play one and it will show up here." />
      ) : data ? (
        <>
          <table className="log-table" aria-describedby={`${id}-caption`} aria-busy={query.isPlaceholderData} data-testid="history-table">
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Points</th>
                <th scope="col">Duration</th>
                <th scope="col">Result</th>
                <th scope="col">Setup</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((record) => (
                <tr key={record.matchId} data-testid="history-row">
                  <th scope="row">
                    <time dateTime={record.endedAt} title={formatPlayedLong(record.endedAt)}>
                      {formatPlayed(record.endedAt)}
                    </time>
                  </th>
                  <td className="log-points">{record.score}</td>
                  <td>{formatClock(record.duration)}</td>
                  <td>{END_REASON_LABEL[record.reason]}</td>
                  <td>
                    {record.setup.sessionTime} s / {record.setup.spawnInterval} s
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination page={data.page} totalPages={data.totalPages} onChange={setPage} label="Match history" />
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
