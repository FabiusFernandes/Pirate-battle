# Pirate Battle

A top-down 2D naval shooter built with **React 19, TypeScript (strict), PixiJS 8, TanStack Query, Axios, MSW and Playwright**. Sail between islands, sink enemy ships and climb the ranking before the time runs out.

**Live demo:** `[https://<your-deployment>.vercel.app](https://pirate-battle-jungle-gaming.vercel.app)` (the published build runs the mock API too)

| Document | Content |
| --- | --- |
| [ARCHITECTURE.md](ARCHITECTURE.md) | React/PixiJS integration, simulation loop, collisions, resources, persistence, ranking/history integration, balancing, limitations |
| [docs/TESTING.md](docs/TESTING.md) | Playwright projects, reproducibility, coverage of each required test area, visual baselines |
| [docs/reports/performance/PERFORMANCE.md](docs/reports/performance/PERFORMANCE.md) | Profiling: FPS, p95 frame time, entities, memory over 5 cycles, environment |
| [docs/reports/playwright/index.html](docs/reports/playwright/index.html) | HTML report of the reference test run |
| [docs/ASSETS.md](docs/ASSETS.md) | Asset sources, licenses and generated files |

## Setup

Requirements: **Node.js ≥ 22.12** and npm. There are no private services and no API keys.

```bash
npm ci
npx playwright install chromium   # only needed for the E2E tests
npm run dev                       # http://localhost:5173
```

`npm run dev` and `npm run build` first run `scripts/prepare-assets.mjs`, which generates the runtime assets in `public/game/` from the committed `assets/` pack.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server (React Strict Mode on) |
| `npm run build` | Type check (`tsc -b`) + optimized production build to `dist/` |
| `npm run preview` | Serve the production build on http://localhost:4173 |
| `npm run lint` | ESLint (typescript-eslint strict, type-checked rules + React hooks rules) |
| `npm run typecheck` | TypeScript only, no output |
| `npm run test:e2e` | Full Playwright suite (desktop + mobile Chromium on the production build, plus Strict Mode lifecycle tests on the dev server) |
| `npm run test:e2e:ui` | Playwright UI mode |
| `npm run test:e2e:visual` | Visual regression tests only |
| `npm run test:e2e:update` | Regenerate the visual baselines |
| `npm run test:report` | Open the last Playwright HTML report |
| `npm run profile` | Build, then profile 3-minute matches and 5 play/exit cycles on the real GPU (writes `docs/reports/performance/`) |

## Environment variables

All optional (see `.env.example`):

| Variable | Default | Purpose |
| --- | --- | --- |
| `VITE_API_BASE_URL` | `/api` | Base URL of the ranking/history API |
| `VITE_API_TIMEOUT_MS` | `4000` | Axios timeout. The `?apiTimeout=<ms>` URL parameter overrides it |
| `VITE_ENABLE_MOCKS` | `true` | Set `false` to skip the MSW service worker (e.g. against a real API) |

## Controls

| Action | Keyboard | Touch |
| --- | --- | --- |
| Sail forward | `W` / `↑` | ↑ button (bottom left) |
| Turn left / right | `A` `D` / `←` `→` | ↶ ↷ buttons |
| Front cannon | `Space` / `K` | front-fire button (bottom right) |
| Left / right broadside (3 balls) | `Q` / `J` and `E` / `L` | side-fire buttons |
| Pause / resume | `Esc` / `P` | pause button (top right) |
| Sound on / off | `M` | pause menu |

- **Combining:** you can sail, turn and fire at the same time. Every finger or key is its own input.
- **When keys are captured:** only while a battle is running. In menus and dialogs, Tab, Enter, Space and Escape work normally.
- **Orientation:** mobile is **landscape only**. In portrait the battle pauses and asks you to rotate the device.
- **Auto-pause:** the game pauses automatically when the window loses focus or the tab is hidden, and waits for you to resume.

## Gameplay configuration

All balancing values live in one typed object, `DEFAULT_GAME_CONFIG` in [`src/game/config/gameConfig.ts`](src/game/config/gameConfig.ts):
- match duration
- spawn interval, initial delay, cap, type weights, opening sequence and distance rules
- health, speed, acceleration and turn rate per ship
- per-weapon damage, projectile speed, range, lifetime, cooldown, count and spacing
- the Shooter's attack range, preferred range and firing arc
- AI avoidance settings

Systems only read the match's config copy, so changing the balance never touches game logic.

The **Options** screen exposes two parameters, validated and saved in localStorage:

| Option | Limits | Default |
| --- | --- | --- |
| Game session time | 60–180 s, steps of 10 | 120 s |
| Enemy spawn time | 1–10 s, steps of 0.5 (must be > 0) | 3 s |

Options also holds the **captain name** shown in the ranking (2–20 characters). Each match takes a frozen copy of the config when it starts: options saved during a match (the pause menu has Options) apply to the next one.

## Ranking, match history and network scenarios

The ranking and history API is simulated by **MSW** in the browser, in dev, tests and the deployed build. Completed matches are registered automatically, once. A registration that fails is saved and retried on the next start, when the connection comes back, or with **Retry**. See [ARCHITECTURE.md](ARCHITECTURE.md#ranking-and-match-history).

### Selecting a scenario

- **In the app:** main menu or Captain's Log → **Mock API scenarios**. The choice is saved and survives a refresh.
- **By URL:** `?scenario=<id>`, e.g. `http://localhost:5173/?scenario=slow`. The URL takes precedence over the saved choice.
- **Reset:** in the same panel, **Reset server** restores the fixtures and the Success scenario. **Clear local data** removes pending registrations and the last result.

| id | Behaviour |
| --- | --- |
| `success` | Everything works (120–450 ms latency) |
| `empty` | Ranking and history return empty pages |
| `many-pages` | +120 ranking entries for the 120 s / 3 s setup |
| `slow` | Every response takes 2.5 s |
| `variable-latency` | Seeded random latency, 100 ms – 3 s |
| `out-of-order` | Odd requests 2.5 s, even 150 ms, so later requests often answer first |
| `timeout` | Nothing ever answers; the client times out |
| `offline` | Network errors on every request |
| `server-error` | HTTP 500 everywhere (retried) |
| `bad-request` | HTTP 400 everywhere (not retried) |
| `ranking-down` | Ranking 503, history OK |
| `history-down` | History 503, ranking OK |
| `register-timeout-after-commit` | First registration is stored but its response is lost; the resend recovers it without a duplicate |
| `register-unavailable` | Registration 503 until you switch back to Success; the match stays pending, then is sent |

Parameters for reproducible runs: `?mockLatency=<ms>` (fixed latency for normal scenarios; `0` for none), `?mockSeed=<n>` (seed of the random latency), `?apiTimeout=<ms>`.

### Reproducing failures by hand

| Goal | Steps |
| --- | --- |
| Loading state | `?scenario=slow` → Ranking |
| Empty lists | `?scenario=empty` → Ranking / Match history |
| Query error + retry | `?scenario=ranking-down` → Ranking shows an error after 3 attempts → panel: Success → **Try again** |
| 4xx without retries | `?scenario=bad-request` → Ranking (a single request in DevTools → Network) |
| Timeout | `?scenario=timeout&apiTimeout=800` → Ranking |
| Out-of-order responses | `?scenario=out-of-order` → Ranking → change *Battle length* while loading: the late answer never replaces the current setup |
| Unavailable at the end of a match, recovered later | `?scenario=register-unavailable` → play a match (set 60 s in Options) → result shows *Not recorded yet* → refresh (it stays pending in Match history) → panel: **Success** → it is sent and shows up in history and ranking |
| Lost response, no duplicate | `?scenario=register-timeout-after-commit&apiTimeout=800` → play a match → result shows *Recorded (recovered after a lost response)* → Match history lists it once |

### Test and debug URL parameters

| Parameter | Effect |
| --- | --- |
| `?seed=<n>` | Fixed seed for spawns and effects |
| `?e2e` | Test bridge (`window.__pirate`: state, manual clock `advance(ms)`, scenario setup; `window.__pirateMocks`). The simulation only advances through `advance()` |
| `?e2e&realtime` | Test bridge with the real frame clock |
| `?audio=off` | No audio. Sound files are not requested |

## Testing

`npm run test:e2e` builds the app, starts the preview and dev servers, and runs 147 tests (143 run, 4 are device-specific skips) on **desktop Chromium, mobile Chromium (Pixel 7, landscape, touch)** and a **dev-server Strict Mode** project.

- **What's covered:** gameplay (driven by real key presses and multi-touch), options, pause and focus loss, results, abandoning matches, ranking and history, every network failure mode, accessibility (axe), and visual regression of the menu, the arena, the result and the ranking.
- **Reproducibility:** every test runs in an isolated browser context with a fixed seed and a controlled clock. An unexpected console error fails the test.
- **Reports:** the HTML report goes to `playwright-report/`, with traces, videos and screenshots kept for failures in `test-results/`.

Details and the coverage matrix are in [docs/TESTING.md](docs/TESTING.md).

> The Playwright version is pinned to 1.62 to match a locally cached Chromium build. Visual baselines were generated on Windows; on another OS run `npm run test:e2e:update` once, because font rendering differs.

## Deployment (Vercel)

`vercel.json` holds the settings (`npm ci`, `npm run build`, output `dist/`). It also serves `mockServiceWorker.js` with `Cache-Control: no-cache`, so the mock worker updates with each deployment. There are no environment variables to set. Netlify and Cloudflare Pages work with the same build command and output directory.

## Known limitations

See [ARCHITECTURE.md → Limitations](ARCHITECTURE.md#limitations). In short:
- **Collision shapes:** ships collide as circles.
- **AI:** enemies use local steering, not pathfinding.
- **Mock data:** the mock ranking is stored per browser.
- **Audio:** needs a user gesture before it can play.
- **Download managers:** sounds are served as JSON bundles, not `.wav` files, so download managers such as IDM don't intercept them. `?audio=off` disables audio entirely.
