# Contributing to Tidebound

Thanks for wanting to help. Bug reports, balance ideas, new spirits and code are all welcome.

## Getting started

```sh
npm install
npm run dev    # play at http://localhost:5173
npm test       # rules, AI and helper tests
npm run build  # typecheck and production build
```

## Where things live

- `src/engine/` is the rules and the AI. It's pure TypeScript with no DOM, and every game is reproducible from a seed. Rule changes belong here, with tests.
- `src/ui/` is everything on screen: rendering, input, animation, sound and saved data.
- `src/ui/spirits.ts` holds the Voyage's spirits. A new spirit is mostly data: a name, a rule twist, a sigil and some lines.

## Pull requests

- Keep each pull request to one change, and describe what a player would notice.
- Add or update tests for anything in `src/engine/` or `src/ui/meta.ts`. CI runs `npm test` and `npm run build` on every pull request.
- For balance changes, say how you checked them. AI-vs-AI simulations (see `src/engine/engine.test.ts`) are a good way.
- Check the game still works on a phone-sized screen and with reduced motion turned on.

## Reporting bugs

Open an issue with what you did, what you expected and what happened. Include the mode (Voyage, Daily Tide, Quick duel or Two players) and the browser. A screenshot of the board helps a lot.
