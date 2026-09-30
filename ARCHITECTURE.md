# Architecture

Pirate Battle is a single-page React 19 + TypeScript (strict) app. PixiJS 8 renders the arena. The ranking and match history come from a REST API that MSW simulates inside the browser, reached through Axios and TanStack Query.

The main rule of the design: **the match lives in a plain TypeScript simulation.** Rendering, input, audio and React only read from it or send intents to it. Nothing continuous goes through React state.

```
src/
├─ game/
│  ├─ sim/          rules: World (state + match rules), Simulation (fixed step), systems/
│  │                (physics, weapons, projectiles, ai, spawner), math (vectors, seeded RNG)
│  ├─ world/        arena map (tile stamps) and collision geometry derived from it
│  ├─ config/       typed GameConfig + defaults, player options (validated, persisted)
│  ├─ engine/       GameSession (one match: loop, pause, HUD store, result),
│  │                GameHost (PixiJS app, canvas, resize/DPR, teardown), FixedStepLoop, Viewport
│  ├─ render/       ArenaRenderer (baked background), WorldRenderer (ships, projectiles,
│  │                event effects), EffectsLayer (pooled particles), HealthBar, procedural textures
│  ├─ input/        InputState (device-independent), keyboard bindings
│  ├─ audio/        AudioManager (Web Audio), MatchAudio (events → sounds)
│  ├─ assets/       manifest + GameAssetLoader (progress, validation, retry, shared cache)
│  ├─ results/      last completed result (persisted)
│  ├─ profile/      player id + captain name (persisted)
│  └─ debug/        e2e bridge (?e2e): state, manual clock, scenario setup
├─ api/             contracts, Axios client, TanStack Query hooks, registration queue + manager
├─ mocks/           MSW handlers, mock DB, fixtures, network scenarios, worker bootstrap
├─ ui/              React screens, dialogs, HUD, touch controls, Captain's Log
└─ lib/             Store (external store for useSyncExternalStore), defensive storage
```

## React ↔ PixiJS integration

```
<GameScreen>           loads assets (GameAssetLoader.state → progress bar / error + retry)
  └─ <Battle>          creates one GameSession per mount (constructor has no side effects)
       ├─ effect: new GameHost({ container, assets, session }) → host.start()
       │          cleanup: host.destroy(); session.detach()
       ├─ <Hud>, <MatchStatus>, <DamageFeedback>     ← useStore(session.hud)
       ├─ <TouchControls>                            → session.input.press/release
       └─ <PauseDialog>, <ResultDialog>              ← hud.status / session.result
```

- **Ownership.**
  - `GameSession` owns the `Simulation`, the `InputState`, the fixed-step loop, pause and end handling, and two small stores (`hud`, `result`).
  - `GameHost` owns the PixiJS `Application`: canvas, ticker, resize and pixel-density observers, the arena, and the teardown order.
  - React owns neither. It creates them inside an effect and releases them in the cleanup.
- **No React render per frame.** The session publishes a `HudState` (health, score, whole seconds left, status) through `Store.set`. The store compares shallowly and only notifies when a value changes. So the HUD re-renders when health or score changes and once per second for the timer. The canvas, ships, projectiles and effects never touch React.
- **Strict Mode.**
  - `Application.init()` is asynchronous. If `destroy()` arrives before init finishes (Strict Mode's mount → unmount → mount), `start()` destroys the half-created app itself.
  - The session supports `start`/`detach` more than once, so the second effect run reuses the same simulation with fresh listeners and renderer.
  - Tested for real on the dev server (`desktop-dev-strict-mode` Playwright project).
- **Keys are only captured during gameplay.** The keyboard listener checks `status === 'running'`, and only then calls `preventDefault`. Menus and dialogs keep normal keyboard behaviour; for example, Space activates the focused Resume button.

## Simulation loop

- **Fixed step:** 1/60 s (`config.simulation.step`). `FixedStepLoop` adds each frame's time (capped at 0.25 s) to an accumulator and runs as many whole steps as fit. Movement, cooldowns, damage and spawns only ever see `dt = step`, so results don't depend on frame rate. A test checks that one 1.5 s advance and fifteen 100 ms advances give identical positions.
- **Interpolation:** every ship and projectile stores its previous pose. The renderer blends between the two poses using the accumulator's leftover (`alpha`), so motion stays smooth on 120/144 Hz screens.
- **Order within one step:**
  1. save previous poses
  2. player: turn, thrust, move, resolve collisions with islands and borders, fire
  3. spawner
  4. enemy AI: steer, move, resolve collisions, shoot
  5. ship-vs-ship contacts (chaser ramming, separation)
  6. projectiles (sweep, hit, remove)
  7. remove dead ships
  8. check whether time is up
- **Match end:** `World.damage()` and `World.end()` hold the rules. The match ends on time up or when the player's health reaches 0. After that, `damage`, `tryFire`, the spawner and scoring all do nothing, because they check `world.running`, and the session stops stepping the loop.
- **Pause:** manual (Esc/P or the button), or automatic on window `blur`, `visibilitychange`, or a phone in portrait. While paused the loop is not advanced at all, so time, cooldowns and projectiles freeze. Pausing clears input and the accumulator. Resuming needs a player action, clears input again, and ignores key auto-repeat, so a key held through the pause does nothing until it's pressed again.
- **Manual clock (tests):** with `?e2e` the host never advances the simulation. `advanceBy(seconds)` runs the same step and input path without the frame cap, and effects advance in the same fixed slices. Rendering happens on demand, which also saves CPU under software WebGL.

## Collisions

Geometry comes from the same arena map used to draw it (`world/obstacles.ts`).

| Pair | Shape | Resolution |
| --- | --- | --- |
| Ship vs island | circle vs rounded rectangle (an inner rectangle inflated by a corner radius; exact distance test) | push out along the contact normal, twice to handle corners. While in contact, speed is capped by how head-on the contact is, so ships **slide** along the coast instead of sticking |
| Ship vs rock | circle vs circle | same as above |
| Ship vs arena border | clamp the centre to `[r, size − r]` | same speed cap, so the ship slides along the edge |
| Chaser vs player | circle overlap (2 units of slack) | chaser is destroyed (`selfDestruct`, never scores), player takes `contactDamage` |
| Other ship vs ship | circle overlap | separation. Enemies give way to the player, so the player is never shoved into an island |
| Projectile vs ship | **swept**: distance from the ship's centre to the segment the ball travelled this step | first ship hit (closest to the segment start), damage applied **once**, projectile removed |
| Projectile vs obstacle / border / range / lifetime | point-circle vs shapes; distance travelled; age | projectile removed (splash effect), no damage |

Destroyed ships leave `world.enemies` in the same step, so they can't collide, shoot or be hit afterwards. Their wreck is only a visual particle.

## Enemy behaviour

- **Chaser:** sails straight at the player at full speed. `clearHeading()` samples headings fanning out from the direct line (±20° steps) and picks the first whose 130-unit probe misses every obstacle. It keeps preferring the side it chose last time, so it doesn't jitter in front of a coastline.
- **Shooter:** approaches (with the same avoidance) until it reaches `preferredRange` (300), then holds its position and keeps its bow on the player. It fires the front cannon only when the player is within `attackRange` (400), inside its firing arc (±12°), off cooldown (1.8 s), and not hidden behind an island.
- **Spawner:** one spawn every `spawn.interval` seconds of active play, after `initialDelay`. The first two spawns are always a Chaser and then a Shooter, so both types appear in any standard match. After that the type is picked by weight. Spawns are skipped while `maxAlive` enemies are on screen.
  - **Spawn points:** sampled with the match's seeded RNG in a band along the arena border. They must be clear of islands (with extra clearance), not overlap another ship, and be at least 480 units from the player. That's more than the Shooter's attack range and several seconds of Chaser travel, so a spawn can never do unavoidable damage.
  - If no valid point is found, the spawner tries again 0.5 s later.

## Rendering and resource management

- **Textures:**
  - **Loading:** `GameAssetLoader` loads the three atlases once per session (UI, tiles, ships/effects), with the resolution chosen from `devicePixelRatio`, through PixiJS `Assets`. That cache is shared by every match, including restarts. Concurrent `load()` calls share one promise, which also keeps Strict Mode safe.
  - **Failures:** progress is published in whole percents. Missing frames are detected before combat starts. A failed load leaves the cache clean for the failed files, so "Try again" only fetches what failed.
- **Per-match GPU resources:** `ArenaRenderer` bakes water and islands into one render texture at 1:1 texel scale. That removes tile seams and makes the background one draw call. The health-bar sub-textures and procedural effect textures (water ring, trail, smoke puff) are also created per match. All of these are destroyed when the match ends; atlas textures are never destroyed.
- **Pooling:** `EffectsLayer` recycles particle sprites (at most 600 active), and projectile sprites and trails are recycled too. Ship views are created and destroyed per entity id.
- **Teardown order:** `GameHost.destroy()` runs observer and listener cleanups, stops the ticker, then asks the session to release its layers (`detachRenderer`) **before** destroying the stage. It then destroys the arena and calls `app.destroy({ removeView: true }, { children: true, texture: false, textureSource: false })`. `session.detach()` removes keyboard, blur and visibility listeners and the audio loops.
  - The lifecycle tests check that five play/exit cycles leave no canvas behind and start each match with the same number of display objects. The profiler reports DOM nodes, event listeners and heap after every cycle.
- **Pixel density:** the renderer resolution is `min(devicePixelRatio, 2)` with `autoDensity`. A `matchMedia('(resolution: Xdppx)')` listener re-applies it when the window moves to another screen.
- **Screen fit:** the fixed 1600 × 896 world is letterboxed into the container (`Viewport.fit`), so rules and coordinates are always in world units. Resizing or rotating never changes gameplay. `Viewport.worldToScreen` / `screenToWorld` map coordinates both ways (used by tests to aim pointer events).
- **Effects on the simulation clock:** effects advance with the simulation clock (0 while paused, fixed slices under the manual clock), and their randomness uses a separate seeded RNG. That's why the visual regression baselines are reproducible.

## Persistence (localStorage)

| Key | Content | Notes |
| --- | --- | --- |
| `pirate-battle:options` | `{ sessionTime, spawnInterval }` | validated on load; invalid or corrupted data falls back to defaults |
| `pirate-battle:profile` | `{ id, name }` | anonymous player UUID + captain name |
| `pirate-battle:last-result` | last **completed** `MatchResult` | written the moment a match ends, before any network request |
| `pirate-battle:registrations` | registration outbox (see below) | pending, failed and recent confirmed entries |
| `pirate-battle:audio` | `{ muted }` | |
| `pirate-battle:mock-db` | mock server: confirmed records + revision | the "server side" of the demo |
| `pirate-battle:mock-scenario` | selected network scenario | also settable with `?scenario=` |
| `sessionStorage pirate-battle:screen` | `result` / `options` | a refresh restores those screens. A battle is never restored: refreshing or leaving abandons it, and abandoned matches are never saved or registered |

All access goes through `lib/storage.ts`, which never throws. The app keeps working if storage is unavailable.

## Ranking and match history

### Contracts (`api/contracts.ts`, shared with the mocks)

```
GET  /api/ranking?sessionTime=&spawnInterval=&page=&pageSize=  → Page<RankingEntry>
GET  /api/players/:playerId/matches?page=&pageSize=           → Page<MatchRecord>
POST /api/matches   body MatchRecordInput, Idempotency-Key: <matchId>
                    → 201 { record, created: true } | 200 { record, created: false }
```

- **Match record:** a `MatchRecordInput` holds `matchId` (a client UUID, also the idempotency key), `playerId`, `playerName`, `score`, `duration` (active play time), `reason`, `setup { sessionTime, spawnInterval }`, `seed` and `endedAt`.
- **Pages:** a `Page` carries `items, page, pageSize, totalItems, totalPages` and the server `revision`.
- **Ranking:** only matches with **the same setup** are compared. Tie-break (`compareRanking`, used by client and mock): higher score, then survived (time up) before sunk, then longer survival, then earlier `endedAt`, then `matchId` (a total order, so rankings are deterministic).

### Client

- **Axios** (`api/client.ts`): base URL `VITE_API_BASE_URL`, timeout `VITE_API_TIMEOUT_MS` (overridable with `?apiTimeout=`). A response interceptor turns every failure into an `ApiError` with a `kind` (`timeout | network | http | invalid | canceled`), an optional `status`, a user message and `retryable`. Retryable means timeout, network, 5xx, 408 or 429. Responses are shape-checked before use.
- **TanStack Query:**
  - **Retries:** only retryable errors, twice, with exponential backoff (0.4 s, 0.8 s…). 4xx is never retried.
  - **Caching:** `staleTime` is 10 s. `refetchOnMount: 'always'`, and a tab only mounts while selected, so showing a tab again refreshes it in the background with the cached data visible. `placeholderData: keepPreviousData` keeps the previous page visible during pagination. Refetch on window focus or reconnect is on.
  - **Keys:** `['ranking', sessionTime, spawnInterval, page]` and `['history', playerId, page]`.
  - **States:** the UI shows loading (skeleton plus a polite status), empty, error (alert plus "Try again"), a background-refresh indicator, and "could not refresh, showing saved results".
  - **Late responses never overwrite newer data.** Superseded fetches of a key are cancelled through the query's `AbortSignal`. On top of that, each response carries the server `revision`, and `freshest()` keeps the cached page whenever an incoming response is older. Responses for another key (e.g. an old setup) only fill that key's cache.

### Registration: exactly one record per completed match

1. When a match ends, `App.onMatchEnd` saves the last result and **enqueues** a record in `registrationQueue`, which is persisted immediately. There is one entry per `matchId`; enqueuing twice does nothing.
2. `RegistrationManager` (headless, mounted at the root) sends `pending` entries one at a time through `useMutation`: `pending → submitting → confirmed | failed`. The mutation retries transient errors. On success it invalidates both `['ranking']` and `['history']`, so both tabs refresh.
3. **Failures:** a `failed` entry stays saved (with the error) and is retried on the next app start, on the browser's `online` event, when the mock scenario is switched back to Success, or when the player clicks **Retry** (on the result, or next to the pending row in Match History).
4. **Refresh while sending:** a `submitting` entry found at start-up was interrupted and is resent.
5. **No duplicates:**
   - Only `pending` entries are sent, and only `failed` entries can be retried, so repeated clicks are no-ops.
   - The server deduplicates on `matchId`. If a response is lost after the server stored the record (timeout), the resend gets `200 { created: false }` with the stored record. The UI shows "recovered after a lost response".
6. The queue is independent of the game, so a new match can start while registrations are pending. API failures never block the game, the options or a running match.

## Mock server (MSW)

- **Where it runs:** `mocks/browser.ts` starts the service worker (`public/mockServiceWorker.js`, committed) **before** the first render, in every build including production. If it can't start, the game still runs and only the log shows errors.
- **Shared handlers:** dev, tests and the deployed demo all use the same `handlers.ts`. The handlers validate input, apply the scenario, and read or write `mockDb`.
- **Consistent data:** `mockDb` is deterministic fixtures (12 captains, fixed seed, fixed dates) plus the confirmed records, persisted in localStorage. Ranking and history are both derived from it, so the two tabs always agree. Every write increases `revision`.
- **Scenarios:** 14, listed in the README. Pick one in the in-app **Mock API scenarios** panel or with `?scenario=<id>`; the choice survives a refresh. "Reset server" restores fixtures only and the Success scenario; "Clear local data" drops the outbox and the last result.
- **Latency:** seeded (`?mockSeed=`), and `?mockLatency=0` removes it for normal scenarios. Tests also get `window.__pirateMocks` with `?e2e`.

## Accessibility

- **Keyboard and focus:** native buttons and form controls, with visible focus rings following the button shapes. Dialogs are native `<dialog>` with `showModal()`, an explicit Tab trap, Escape handling and focus restored on close. The Captain's Log uses WAI-ARIA tabs with arrow-key navigation.
- **Forms and errors:** labelled fields, `aria-invalid` plus `role="alert"` error text, and a status for "saved". Errors across the app use `role="alert"`.
- **Game state:** the canvas and the graphic HUD are `aria-hidden`. `MatchStatus` exposes health, score, time left and state as a definition list. Its polite live region only announces meaningful moments (enemy sunk, low health, pause and resume, 60/30/10 s left), never every frame.
- **Checks and motion:** axe (WCAG 2.1 A/AA, contrast included) runs on every screen and dialog in the test suite. `prefers-reduced-motion` disables screen shake, the low-health pulse and the result delay.
- **Orientation:** landscape on touch devices. In portrait the battle pauses behind a "rotate your device" notice.

## Balancing decisions

All values live in `DEFAULT_GAME_CONFIG` (`game/config/gameConfig.ts`); systems read only the match's frozen config copy.

| Parameter | Value | Why |
| --- | --- | --- |
| Arena | 1600 × 896 units (25 × 14 tiles) | 16:9-ish; ships stay readable on a phone in landscape |
| Player | 100 HP, 170 u/s, 150°/s | fastest ship on the water: you can always outrun a Chaser if you keep sailing |
| Front cannon | 34 dmg, 0.4 s, 560 u/s, 560 range | precise poke: 2 hits sink a Chaser, 3 a Shooter |
| Broadside (each side) | 3 × 25 dmg, 1.2 s, 460 u/s, 380 range, 24 u spacing | high burst at short range; rewards turning side-on |
| Chaser | 50 HP, 125 u/s, 110°/s, 20 ram damage | slower than the player and turns wider, so dodging is a matter of skill; 5 rams sink you |
| Shooter | 75 HP, 90 u/s, fires 10 dmg every 1.8 s within 400 u, holds at 300 u | a steady ranged threat that forces you to move |
| Spawns | every 3 s (1–10 s), first after 1.5 s, max 8 alive, 55/45 Chaser/Shooter | pressure grows without flooding the arena |
| Spawn distance | ≥ 480 u from the player | more than the Shooter's range, so nothing hits you on arrival |

## Performance

See `docs/reports/performance/PERFORMANCE.md`: 3-minute matches on the optimized build, frame-time percentiles, entity counts, and heap, DOM nodes and listeners after start/play/exit cycles.

Main choices:
- one baked arena texture
- sprites from three atlases, so batches stay large
- no masks, and no MSAA (everything is textured sprites)
- pooled particles and projectiles
- the HUD in the DOM, updated at most once per second

## Limitations

- **Circle hulls:** ships use circle collision, which is simpler and stable, but the long hulls overhang slightly at the bow and stern.
- **Steering:** AI avoidance is local steering, not pathfinding. A Chaser can take a detour around the larger islands, but the arena has no traps deep enough to catch it.
- **Mock server scope:** the mock DB lives in the player's own browser (localStorage), so "other players" are fixtures and ranking entries aren't shared between devices.
- **Audio:** audio needs a user gesture (browser policy), and the first sounds may be skipped while the bundles download and decode. Sounds ship as base64 WAV inside JSON bundles because download managers (e.g. IDM) intercept `.wav` requests; `?audio=off` disables audio entirely.
- **Visual baselines:** they are tied to the operating system's font rendering (generated on Windows). See `docs/TESTING.md`.
