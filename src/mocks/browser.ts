import { setupWorker } from 'msw/browser';
import { handlers } from './handlers';

/**
 * Starts the MSW service worker (dev, tests and the production demo). If the worker cannot
 * start (unsupported browser, blocked service workers), the app still runs: only the ranking
 * and history show their error states.
 */
export async function enableMocking(): Promise<boolean> {
  if (import.meta.env.VITE_ENABLE_MOCKS === 'false') return false;
  try {
    const worker = setupWorker(...handlers);
    await worker.start({
      serviceWorker: { url: `${import.meta.env.BASE_URL}mockServiceWorker.js` },
      onUnhandledFrame: 'bypass',
      quiet: true,
    });
    return true;
  } catch (error: unknown) {
    console.warn('[mocks] API mocking unavailable:', error instanceof Error ? error.message : error);
    return false;
  }
}
