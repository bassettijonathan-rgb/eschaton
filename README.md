# Eschaton

A browser game that is, as faithfully as a computer allows, **Eschaton**: the
tennis-court global-thermonuclear-war game played by the students of Enfield
Tennis Academy in David Foster Wallace's _Infinite Jest_ (1996).

Four tennis courts are the world. Dead tennis balls are 5-megaton warheads,
launched only by racquet. Shirts, towels, shorts, armbands, socks and sneakers
laid on the courts are cities, airfields, command sites and submarines. The
game-master wears the beanie and runs EndStat, and the map is not the territory.

This repository is being built milestone by milestone (M0 through M9). So far the
page draws the four courts with the world on them, every target garment, the
players, their buckets and Lord's cart; clicking a garment names what it is on
the map, and the game-master's allocation table shows each Combatant's warheads.

## Running it

You need Node 22 or later.

```sh
npm install
npm run dev          # http://localhost:5173
```

Drag to tilt and turn the camera; scroll to zoom.

## Checks

```sh
npm run typecheck    # TypeScript, strict
npm run lint         # ESLint
npm run format:check # Prettier (npm run format to fix)
npm test             # Vitest unit tests
npm run build        # production build into dist/
npm run test:e2e     # Playwright smoke test (builds and serves dist/ itself)
npm run check        # everything above except the browser test
```

The first time you run the browser test, install its browser with
`npx playwright install chromium`.

CI (`.github/workflows/ci.yml`) runs all of these on every pull request.

## Layout

| Path          | What lives there                                                                                                                        |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `src/engine/` | The rules core: pure, deterministic and seeded. No DOM, no Three.js, no `Math.random`, no wall clock (lint enforces this). Unit-tested. |
| `src/render/` | Three.js scene building: courts, and later the map, garments, players and the lob.                                                      |
| `src/ui/`     | Page panels, such as the game-master's allocation table.                                                                                |
| `src/main.ts` | Page entry point.                                                                                                                       |
| `e2e/`        | Playwright browser tests.                                                                                                               |
| `docs/`       | `FIDELITY.md`: every reading of the novel the game makes, and why.                                                                      |

## Source

The game follows the "Interdependence Day" chapter of _Infinite Jest_ and its
endnotes 121 to 130. All in-game text is written for this project; no passages
of the novel are reproduced here.

Map data: [Natural Earth](https://www.naturalearthdata.com/) (public domain), via
[world-atlas](https://github.com/topojson/world-atlas).
