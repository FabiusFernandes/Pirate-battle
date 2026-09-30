import { registrationQueue } from '@/api/registrationQueue';
import { useStore } from '@/lib/store';

/** Shows whether a finished match has reached the ranking/history server, with a retry. */
export function RegistrationStatus({ matchId }: { matchId: string }) {
  const entries = useStore(registrationQueue.store);
  const entry = entries[matchId];

  let text: string;
  let tone: 'busy' | 'ok' | 'warn';
  if (!entry) {
    text = 'Not recorded.';
    tone = 'warn';
  } else if (entry.status === 'confirmed') {
    text = entry.created === false ? "Recorded in the Captain's Log (recovered after a lost response)." : "Recorded in the Captain's Log.";
    tone = 'ok';
  } else if (entry.status === 'failed') {
    text = `Not recorded yet: ${entry.lastError ?? 'unknown error'} It is saved on this device and will be sent again.`;
    tone = 'warn';
  } else {
    text = "Recording to the Captain's Log…";
    tone = 'busy';
  }

  return (
    <div className={`registration registration--${tone}`} data-testid="registration-status" data-status={entry?.status ?? 'none'}>
      <p role="status">{text}</p>
      {entry?.status === 'failed' && (
        <button
          type="button"
          className="link-button"
          onClick={() => {
            registrationQueue.retry(matchId);
          }}
          data-testid="registration-retry"
        >
          Retry now
        </button>
      )}
    </div>
  );
}
