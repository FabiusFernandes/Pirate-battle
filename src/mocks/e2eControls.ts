import type { MatchRecordInput } from '@/api/contracts';
import { E2E_ENABLED } from '@/game/debug/e2eBridge';
import { mockDb } from './db';
import { activeScenario, setScenario } from './scenarios';

/**
 * Test-only control of the mock server (enabled with `?e2e`): switch scenarios while a
 * match is running and insert records directly (e.g. to create several history pages).
 */
export interface PirateMocksApi {
  scenario(): string;
  setScenario(id: string): void;
  reset(): void;
  insert(records: MatchRecordInput[]): number;
  revision(): number;
}

declare global {
  interface Window {
    __pirateMocks?: PirateMocksApi;
  }
}

if (E2E_ENABLED) {
  window.__pirateMocks = {
    scenario: () => activeScenario.getSnapshot(),
    setScenario,
    reset: () => {
      mockDb.reset();
    },
    insert: (records) => records.filter((r) => mockDb.insert(r).created).length,
    revision: () => mockDb.revision,
  };
}
