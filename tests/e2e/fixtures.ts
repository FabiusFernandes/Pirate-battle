import { expect, test as base } from '@playwright/test';

export interface ConsoleGuard {
  /** Console errors / uncaught exceptions collected during the test. */
  errors: string[];
  /** Error substrings that are expected in this test (e.g. deliberately failed requests). */
  allow: (pattern: RegExp) => void;
}

/**
 * Every test starts from an isolated state (fresh context, empty storage) and fails if the
 * page logs an unexpected console error or throws an uncaught exception.
 */
export const test = base.extend<{ consoleGuard: ConsoleGuard }>({
  consoleGuard: [
    async ({ page }, use) => {
      const errors: string[] = [];
      const allowed: RegExp[] = [];
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
      });
      page.on('pageerror', (error) => {
        errors.push(`pageerror: ${error.message}`);
      });
      await use({
        errors,
        allow: (pattern) => {
          allowed.push(pattern);
        },
      });
      const unexpected = errors.filter((text) => !allowed.some((pattern) => pattern.test(text)));
      expect(unexpected, 'unexpected console errors').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
