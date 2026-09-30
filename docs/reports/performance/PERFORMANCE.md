# Performance report

Generated 2026-09-30T20:54:30.210Z by `npm run profile` (scripts/profile.mjs).

## Environment

| | |
| --- | --- |
| browser | Chromium 151.0.7922.34 (Playwright, new headless mode) |
| renderer | ANGLE (AMD, AMD Radeon RX 7600 (0x00007480) Direct3D11 vs_5_0 ps_5_0, D3D11) |
| dpr | 1 |
| ua | Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/151.0.0.0 Safari/537.36 |
| viewport | 1920 × 1080 CSS px |
| matchSeconds | 180 |
| hardware | AMD Ryzen 5 5600 (6C/12T), AMD Radeon RX 7600 (driver 32.0.31041.1004), 16 GB RAM, Windows 11 Pro, display 1920x1080 @ 144 Hz |

## Three-minute matches

Audio is disabled for these runs (`?audio=off`): sound decoding and mixing are not measured.

Automated player (always sailing, weaving, firing all three weapons), invulnerable so the match lasts 180 s. The first second is excluded from frame statistics (shader compilation and first uploads).

| Run | Frames | Avg FPS | Mean ms | p50 ms | p95 ms | p99 ms | Max ms | >20 ms | >33 ms | Enemies max/avg | Projectiles max/avg | Effects max | Display objects max | Heap MB start → end (max) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | ---: | ---: | --- |
| Default setup (180 s, spawn every 3 s) | 21516 | 119.1 | 8.4 | 8 | 11.5 | 12.4 | 27.6 | 1 | 0 | 8 / 4.8 | 8 / 1.5 | 70 | 181 | 11.19 → 11.38 (13.29) |
| Stress setup (180 s, spawn every 1 s) | 20578 | 113.9 | 8.78 | 8.7 | 10.6 | 12.2 | 41.8 | 6 | 1 | 8 / 7.4 | 8 / 1.7 | 72 | 203 | 11.23 → 11.47 (13.48) |

## Memory after start → play → exit cycles

Each cycle plays 20 s (spawn every 2 s, all weapons firing) and returns to the menu. Measured after 3 forced garbage collections.

| Point | JS heap MB | DOM nodes | JS event listeners | Canvases |
| --- | ---: | ---: | ---: | ---: |
| menu (before any match) | 4.26 | 82 | 176 | 0 |
| after cycle 1 | 7.14 | 86 | 192 | 0 |
| after cycle 2 | 7.37 | 86 | 192 | 0 |
| after cycle 3 | 7.6 | 86 | 192 | 0 |
| after cycle 4 | 7.74 | 86 | 192 | 0 |
| after cycle 5 | 7.98 | 86 | 192 | 0 |

## Findings

- **60 FPS target: met with headroom.** The headless frame clock is not tied to a display refresh, so it runs faster than 60 Hz; the relevant figure is frame time. The worst p95 across runs is **11.5 ms**, against the 16.7 ms budget of 60 FPS. Slow frames (> 33 ms) are isolated spikes, not sustained drops.
- **Entity load.** Enemies are capped by `spawn.maxAlive` (8); the stress run keeps the cap almost always full. Display objects on stage peak around 200 (ships, health bars, fires, projectiles, trails, pooled particles), all batched from three atlases plus one baked arena texture.
- **Memory inside a match is flat** (heap start ≈ end over 3 minutes): projectiles and particles are pooled, entity views are released per id.
- **Across start → play → exit cycles**, DOM nodes, JS event listeners and canvases return to the same values after every cycle (stable): no listener, canvas or overlay survives a match. The first match adds the one-time cost of the atlas cache and compiled code; afterwards `JSHeapUsedSize` grows ≈ 0.21 MB per cycle (a 12-cycle run, `PROFILE_ONLY=memory PROFILE_CYCLES=12`, showed it falling to ≈ 0.1 MB per cycle by the end).
- **Heap growth investigation.** Heap snapshots after cycle 2 and after cycle 8 (CDP `HeapProfiler`, 3 forced GCs, constructor-level diff) show only ≈ 24 KB of retained objects over those six cycles (plain objects, closures, a few promises and generators). **No PixiJS `Sprite` / `Container` / `Texture`, WebGL or DOM objects accumulate.** The remaining increase of `JSHeapUsedSize` is V8-internal (compiled code, inline caches, feedback vectors) and levels off. Conclusion: no continuous growth of game resources.

## Limitations of this measurement

- Headless Chromium (new headless mode) with ANGLE/D3D11 on the real GPU. A headed browser paces frames to the display refresh (vsync), so it shows 60/144 FPS instead of the uncapped rate.
- Audio disabled; the automated player is invulnerable (health 1,000,000) so every match lasts the full 180 s, which is also the worst case for entity counts.
- GPU memory is not observable from the page; resource release is checked through object counts (above) and the Playwright lifecycle tests (one canvas, same display-object count at every match start).
- One run per setup on one machine; figures vary a few percent between runs.
