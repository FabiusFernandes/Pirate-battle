import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useId, useRef, useState } from 'react';
import { registrationQueue } from '@/api/registrationQueue';
import { lastResult } from '@/game/results/lastResult';
import { mockDb } from '@/mocks/db';
import { SCENARIOS, activeScenario, setScenario } from '@/mocks/scenarios';
import { useStore } from '@/lib/store';
import { removeKey } from '@/lib/storage';
import { MenuButton } from '../components/MenuButton';
import { ModalDialog } from '../components/ModalDialog';

/**
 * Selects the mock API scenario (persisted, also settable with `?scenario=<id>`) and restores
 * the initial state. Available in every build so failure modes can be demonstrated on the
 * deployed version.
 */
export function NetworkPanel({ onClose }: { onClose: () => void }) {
  const id = useId();
  const current = useStore(activeScenario);
  const queryClient = useQueryClient();
  const [message, setMessage] = useState('');
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  const choose = (scenarioId: string) => {
    setScenario(scenarioId);
    // A recovered API should pick up failed registrations right away.
    if (scenarioId === 'success') registrationQueue.retryAllFailed();
    void queryClient.invalidateQueries();
    setMessage('');
  };

  const resetServer = () => {
    setScenario('success');
    mockDb.reset();
    void queryClient.resetQueries();
    setMessage('Mock server reset: fixtures only, scenario “Success”.');
  };

  const clearLocal = () => {
    registrationQueue.clear();
    removeKey('pirate-battle:last-result');
    lastResult.set(null);
    void queryClient.resetQueries();
    setMessage('Local player data cleared (pending registrations and last result).');
  };

  return (
    <ModalDialog labelledBy={`${id}-title`} describedBy={`${id}-desc`} onEscape={onClose} className="modal--wide" testId="network-panel">
      <h2 id={`${id}-title`} className="panel-title">
        Mock API scenarios
      </h2>
      <p id={`${id}-desc`} className="dialog-hint">
        Ranking and history use a simulated REST API (MSW). Pick how it behaves; the choice survives a refresh.
      </p>
      <fieldset className="scenario-list">
        <legend className="visually-hidden">Scenario</legend>
        {SCENARIOS.map((s) => (
          <label key={s.id} className="scenario" data-testid={`scenario-${s.id}`}>
            <input
              type="radio"
              name={`${id}-scenario`}
              value={s.id}
              checked={current === s.id}
              onChange={() => {
                choose(s.id);
              }}
            />
            <span>
              <strong>{s.label}</strong>
              <span className="scenario__desc">{s.description}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <div className="options-form__actions">
        <MenuButton variant="secondary" size="small" onClick={resetServer} data-testid="mock-reset">
          Reset server
        </MenuButton>
        <MenuButton variant="secondary" size="small" onClick={clearLocal} data-testid="local-clear">
          Clear local data
        </MenuButton>
      </div>
      <p role="status" className="options-form__status" data-testid="network-status">
        {message}
      </p>
      <MenuButton ref={closeRef} onClick={onClose} data-testid="network-close">
        Close
      </MenuButton>
    </ModalDialog>
  );
}
