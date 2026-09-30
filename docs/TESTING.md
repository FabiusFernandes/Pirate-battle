# Testing

End-to-end tests use **Playwright** against the optimized production build (`vite build` + `vite preview`), which is also what gets deployed. A third project runs the lifecycle tests against the **Vite dev server**, where React Strict Mode double-invokes effects.

| Project | Target | Device |
| --- | --- | --- |
| `desktop-chromium` | production build (port 4173) | Desktop Chrome, 1280 × 720 |
| `mobile-chromium` | production build (port 4173) | Pixel 7, landscape, touch, DPR 2.625 |
| `desktop-dev-strict-mode` | dev server (port 5173), Strict Mode | Desktop Chrome, 1280 × 720 (`lifecycle` and `assets` specs only) |

## Commands

```bash
npx playwright install chromium   # once
npm run test:e2e                   # full suite (starts both servers automatically)
npm run test:e2e -- combat         # one spec file
npm run test:e2e:ui                # interactive UI mode
npm run test:e2e:visual            # only the visual regression tests (@visual)
npm run test:e2e:update            # regenerate the visual baselines
npm run test:report                # open the last HTML report
```

- **HTML report:** `playwright-report/index.html`. A copy of the reference run is kept in `docs/reports/`.
- **Traces:** failed tests keep a trace, video and screenshot in `test-results/<test>/`. Open a trace with `npx playwright show-trace test-results/<test>/trace.zip`.

## How the tests stay reproducible

- **Isolated state:** every test gets a fresh browser context, so localStorage, the mock server's DB and the service worker all start clean. A fixture fails any test that logs an unexpected console error or throws an uncaught exception.
- **Test bridge:** `?e2e` enables the bridge (`window.__pirate`). It exposes the simulation state, the manual clock (`advance(ms)`) and scenario setup (`setOverrides`, `spawnEnemy`, `setPlayerPose`). Rules, collisions, input handling and rendering are the real ones.
  - Combat tests press real keys (`page.keyboard`).
  - Touch tests send real multi-touch events through Chrome DevTools (`Input.dispatchTouchEvent`).
- **Fixed randomness:** `?seed=<n>` fixes the gameplay randomness (spawn points, effect particles).
- **Mock API control:** `?scenario=<id>`, `?mockLatency=0`, `?mockSeed=<n>` and `?apiTimeout=<ms>` control the mock API. `window.__pirateMocks` can switch scenarios mid-test and insert records.
- **Fixed locale and timezone:** tests run with `en-GB` and `UTC`, and fixture dates are fixed, so dates always render the same way.
- **Workers:** limited to 2, because headless WebGL uses software rendering (SwiftShader), which is CPU-bound.

## Coverage of the required areas

| # | Requirement | Specs |
| --- | --- | --- |
| 1 | Navigation, validation and persistence of the options | `options.spec.ts`, `screens.spec.ts` (keyboard navigation) |
| 2 | Asset loading, failures and retry | `assets.spec.ts` |
| 3 | Match start, movement, rotation, arena limits, island collision | `movement.spec.ts` |
| 4 | Front and side fire, damage, cooldown, score without duplication | `combat.spec.ts` |
| 5 | Chaser and Shooter behaviour, spawn interval | `enemies.spec.ts`, `lifecycle.spec.ts` (default match spawns both types) |
| 6 | End by time and by death, simulation stops, clean restart | `match.spec.ts`, `lifecycle.spec.ts` |
| 7 | Pause, focus loss and resume without the timer advancing | `pause.spec.ts` (manual clock and real-time clock) |
| 8 | Result display and persistence after refresh | `screens.spec.ts`, `match.spec.ts` |
| 9 | Abandoning a match, repeated navigation, touch controls | `navigation.spec.ts`, `lifecycle.spec.ts` |
| 10 | Ranking and Match History: queries, pagination, loading, empty and error states | `api.spec.ts` |
| 11 | Match registration, both tabs updating, pending registration recovered after refresh | `api.spec.ts` |
| 12 | Resend after timeout without duplicates; late responses never overwrite newer data | `api.spec.ts` |
| – | Visual regression: menu, arena in a stable state, result (dialog and restored screen), ranking | `visual.spec.ts` |
| – | Accessibility (axe WCAG 2.1 A/AA), focus trapping, semantic match status | `screens.spec.ts` |
| – | Effects lifecycle, damage feedback, sound toggle | `feedback.spec.ts` |
| – | React Strict Mode, pixel density, resize, no resource build-up | `lifecycle.spec.ts` |

## Visual baselines

Baselines live in `tests/e2e/__screenshots__/<project>/visual.spec.ts/` and are versioned. They were generated on the reference environment (Windows 11, Chromium from Playwright 1.62, SwiftShader WebGL). Font rasterization differs between operating systems, so on another OS, regenerate them once with `npm run test:e2e:update` before comparing.

The tolerance is `maxDiffPixelRatio: 0.002`. WebGL output is deterministic under SwiftShader, so a larger tolerance would hide real regressions. One example: a wreck that should not be there covers less than 1% of the arena.
