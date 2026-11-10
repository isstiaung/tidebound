# Tidebound

[![CI](https://github.com/isstiaung/tidebound/actions/workflows/ci.yml/badge.svg)](https://github.com/isstiaung/tidebound/actions/workflows/ci.yml)
[![Deploy](https://github.com/isstiaung/tidebound/actions/workflows/deploy.yml/badge.svg)](https://github.com/isstiaung/tidebound/actions/workflows/deploy.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**[Play it in your browser](https://isstiaung.github.io/tidebound/)**. No install or account needed, and it works offline once loaded.

A two-sky card duel for the browser. Every card has two numbers: a **sun** number on top and a **moon** number printed upside down. Each of the three shrines sits under the sun or the moon, and cards in a shrine physically turn over to show the number that counts. A tide sweeps across the shrines, flipping their skies on a schedule you can see coming.

## Ways to play

- **The Voyage.** Cross the sea against five tide spirits, one after another. Each bends the rules: the Storm Petrel's tide turns after every move, the Drowned Choir's shrines hold only three cards a side, the Eclipse Moth hides the tide in fog (where it wanders at random, unseen by either player) and stuffs the deck with Eclipses, and the Leviathan holds an extra card and extra Undertows. Each spirit has its own personality (and opinions about how you play). Progress is saved.
- **Daily Tide.** One seeded deal per day, the same for everyone, against the Cunning Oracle. Copy a spoiler-free result to share.
- **Quick duel.** Standard rules against the Oracle, Gentle or Cunning. Your record is kept; starting a new game while a duel is in progress counts that duel as a loss.
- **Two players.** Pass one device back and forth, with a hand-off screen that hides each hand.

Drag cards onto shrines (or tap a card, then a shrine). Played cards fly in upright, then turn to face their shrine's sky; the tide sweeps across the shrine it flips; sealed shrines burst into sparks. There's a living starfield, an ocean ambience you can switch off, and everything respects reduced-motion settings.

## How to play

1. **Two numbers, one counts.** In a shrine, a card counts the number that matches the shrine's sky.
2. **Play one card a turn** to your side of any shrine (four places per side), then draw.
3. **The tide turns.** After every round, the tide flips the sky of the marked shrine, then moves on to the next one.
4. **Shrines seal** when both sides are full, under whatever sky they have at that moment. Higher total takes the shrine. Ties go to whoever filled their side first.
5. **Take two shrines to win.**

Plain cards always add up to 10 (a 9 under the sun is a 1 under the moon). Special cards (Eclipse, Tidecaller, Anchor, Undertow, Twilight, Lantern, Echo, Drift) bend those rules. The first player starts with an extra card, because moving second is an advantage in simulation.

Keyboard: number keys pick a card from your hand, then Q, W or E plays it to the left, middle or right shrine. Esc cancels.

## Run it locally

```sh
npm install
npm run dev        # http://localhost:5173
```

## Test

```sh
npm test
```

The test suite covers:

- every rule and ability, including edge cases (undertow on the last open place, eclipse on the sealing card, forced seals after two passes, draws);
- fuzzed random games under every rule variant, checking that every card is always in exactly one place, no side overflows, sealed shrines never change, and every game ends;
- the AI only ever making legal moves, never peeking at your hand, the deck order or a fogged tide, and the Cunning AI beating the Gentle one;
- the Daily Tide seed, the share text, Voyage unlocking, spirit data, and storage that fails safely.

## Deploy

`npm run build` writes a fully static site to `dist/`, using relative asset paths, so it can be served from any host or sub-path:

- **GitHub Pages:** push to `main`. The included workflow (`.github/workflows/deploy.yml`) tests, builds and publishes. In the repo settings, set Pages → Source to "GitHub Actions".
- **Netlify / Vercel / Cloudflare Pages:** build command `npm run build`, output directory `dist`.
- **Anything else:** copy `dist/` to any static file server.

Once loaded, the game works offline (a service worker caches it) and can be installed as an app from the browser. Fonts are bundled locally, and sounds are synthesized, so it makes no network requests to third parties.

## Code layout

```
src/engine/cards.ts   the 40-card deck and ability text
src/engine/game.ts    pure, deterministic rules engine (seeded shuffles)
src/engine/ai.ts      the Oracle: heuristic evaluation + sampled 2-ply search
src/engine/ai.worker.ts  runs the AI off the main thread (ui/aiClient.ts falls back if workers fail)
src/ui/app.ts         game flow, rendering, drag and drop, staged animations
src/ui/spirits.ts     the Voyage's five spirits: rules, sigils and lines
src/ui/meta.ts        Daily Tide seeding, share text, Voyage progress (pure)
src/ui/fx.ts          starfield, particles, tide sweeps, card flights
src/ui/sound.ts       synthesized sound effects and ocean ambience
public/               icon, web manifest, service worker
```

## Contributing

Bug reports, balance ideas, new spirits and code are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md).

## Credits

- Typefaces: [IM Fell English](https://fonts.google.com/specimen/IM+Fell+English) by Igino Marini and [Outfit](https://github.com/Outfitio/Outfit-Fonts) by the Outfit Project Authors, both under the [SIL Open Font License 1.1](https://openfontlicense.org), bundled via [Fontsource](https://fontsource.org).
- Everything else (cards, sigils, sounds and code) is original to this project.

## License

[MIT](LICENSE)
