# Eschaton

A browser game that is, as faithfully as a computer allows, **Eschaton**: the
tennis-court global-thermonuclear-war game played by the students of Enfield
Tennis Academy in David Foster Wallace's _Infinite Jest_ (1996).

Four tennis courts are the world. Dead tennis balls are 5-megaton warheads,
launched only by racquet. Shirts, towels, shorts, armbands, socks and sneakers
laid on the courts are cities, airfields, command sites and submarines. The
game-master wears the beanie and runs EndStat, and the map is not the territory.

**Play it at <https://bassettijonathan-rgb.github.io/eschaton/>.**

The page draws the four courts with the world on them, every target garment, the
players, their buckets and Lord's cart; clicking a garment names what it is on
the map, and the game-master's allocation table shows each Combatant's warheads.
Viewing as a Combatant, you can take the racquet: pick a launch platform, aim on
the map, set elevation, topspin and pace, and swing against the timing meter. The
ball (or a MIRV jockstrap that opens at the top of its arc) flies with real
tennis-ball physics and detonates where it first touches the court. EndStat, on the
Yushityu, works out what each warhead did (blast, firestorms, fallout plumes, EMP),
keeps the INDDIR and SUFDDIR tallies with their four corrections and SACPOP
penalties, and confirms a winner by ratio, showing its working.

The game-master's clipboard runs a whole game: a quorum endorses the World
Situation and agrees a TRIGSIT, the summit records alliances, humane-war pacts,
hotlines, DEFCON gradients and city trades, and in play the game-master validates
every order against DEFCON, pacts and cessations, ferries hotline messages (EMP
shortens them), changes beanies (white for a cessation, red for Utter Global
Crisis, black for nothing at all) and runs the clock to the siren. Switch who is
viewing and a hand-off screen hides the last player's secrets. Human God mode
lets a person make the rulings instead.

The map is not the territory. A ball that strikes a player, a racquet, a bucket
or Lord's cart stops there and scores nothing. Snow or rain on the courts is drawn
but never reaches EndStat, however hard a Combatant appeals. Only submarines and
carrier groups ever move, at sea and within their range, and anything else stays
where the map puts it.

Any Combatant, and the game-master, can be handed to the computer. Computer
Combatants endorse or reject the World Situation, bluff at the summit, accept or
decline pacts and break them according to their head of state's profile, pick
targets with the Decision Tree and swing with a skill setting; "Watch the
computers play a whole game" runs one from the World Situation to EndStat's
winner. The Yushityu shows the Decision Tree's suggestion, and "Appeal to
Pemulis" shows the full audit trail of any calculation.

The game-master can also start **Interdependence Day, Y.D.A.U.**, the chapter's own
game. Its World Situation and cast come from the chapter: LaMont Chu, Ann
Kittenplan, Evan Ingersoll and the rest, with Otis P. Lord in the beanie. Its
TRIGSIT plays out in order, from the explosions at AMNAT's satellite receivers to
EndStat's Decision Tree positing a SPASEX response from AMNAT, with LIBSYR becoming
IRLIBSYR on the way. The first snow of the year falls mid-afternoon and changes
nothing. Pemulis wins the argument, so a ball that hits a player scores nothing
and the game runs on to the 1600h siren.

The **Rulebook** button opens the rules, in the spirit of Hal's: six sections,
appendices on the garments and the Combatants, sample Decision Trees worked out
live by the game's own, and a short essay on the game theory. A five-card
**Introduction** greets a first visit. Everything but the swing works from the
keyboard ("Find on the courts" inspects any garment, the arrow keys move the view,
and submarines are steered by compass bearing), and the latest log line is read
out to screen readers. A lob pops off the racquet and the siren winds up at 1600h;
**Sound** turns both off. An idle page stops drawing, so it is light on a laptop.

## Running it

You need Node 22 or later.

```sh
npm install
npm run dev          # http://localhost:5173
```

Drag to tilt and turn the camera; scroll to zoom. With the courts focused, the
arrow keys move the view.

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

CI (`.github/workflows/ci.yml`) runs all of these on every pull request. Every push
to `main` builds the site and deploys it to GitHub Pages
(`.github/workflows/pages.yml`); the repository's Pages source must be set to
"GitHub Actions".

## Layout

| Path          | What lives there                                                                                                                                                                                                |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/engine/` | The rules core: pure, deterministic and seeded. No DOM, no Three.js, no `Math.random`, no wall clock (lint enforces this). Unit-tested.                                                                         |
| `src/render/` | Three.js scene building: courts, the map, garments, players, and lobs in flight.                                                                                                                                |
| `src/ui/`     | Page panels: the game-master's clipboard, the hand-off screen, the allocation table, the legend, the inspector, the racquet, EndStat, the computer players' switches, the rulebook, the introduction and sound. |
| `src/main.ts` | Page entry point.                                                                                                                                                                                               |
| `e2e/`        | Playwright browser tests.                                                                                                                                                                                       |
| `docs/`       | `FIDELITY.md`: every reading of the novel the game makes, and why.                                                                                                                                              |

## Source

The game follows the "Interdependence Day" chapter of _Infinite Jest_ and its
endnotes 121 to 130. All in-game text is written for this project; no passages
of the novel are reproduced here.

Map data: [Natural Earth](https://www.naturalearthdata.com/) (public domain), via
[world-atlas](https://github.com/topojson/world-atlas).
