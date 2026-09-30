import type { ApiError } from '@/api/client';
import { MenuButton } from '../components/MenuButton';

/** Placeholder rows while the first page loads. */
export function LoadingRows({ columns, label }: { columns: number; label: string }) {
  return (
    <div className="log-state" aria-busy="true" data-testid="log-loading">
      <p className="visually-hidden" role="status">
        Loading {label}…
      </p>
      <table className="log-table log-table--skeleton" aria-hidden="true">
        <tbody>
          {Array.from({ length: 5 }, (_, row) => (
            <tr key={row}>
              {Array.from({ length: columns }, (_, col) => (
                <td key={col}>
                  <span className="skeleton" />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function EmptyState({ message }: { message: string }) {
  return (
    <p className="log-state log-state--empty" data-testid="log-empty">
      {message}
    </p>
  );
}

export function ErrorState({ what, error, onRetry, retrying }: { what: string; error: ApiError; onRetry: () => void; retrying: boolean }) {
  return (
    <div className="log-state log-state--error" data-testid="log-error">
      <p role="alert">
        Could not load the {what}. {error.userMessage}
      </p>
      <MenuButton variant="secondary" size="small" onClick={onRetry} disabled={retrying} data-testid="log-retry">
        {retrying ? 'Retrying…' : 'Try again'}
      </MenuButton>
    </div>
  );
}

/** Shown while cached data is being refreshed in the background, or when that refresh failed. */
export function RefreshIndicator({ fetching, error, onRetry }: { fetching: boolean; error: ApiError | null; onRetry: () => void }) {
  if (error && !fetching) {
    return (
      <p className="log-refresh log-refresh--error" role="alert" data-testid="log-refresh-error">
        Could not refresh ({error.userMessage}) Showing saved results.{' '}
        <button type="button" className="link-button" onClick={onRetry}>
          Retry
        </button>
      </p>
    );
  }
  return (
    <p className="log-refresh" role="status" data-testid="log-refreshing">
      {fetching ? 'Updating…' : ''}
    </p>
  );
}
