# TypeAny

**TypeAny** is a typing-practice web app that lets you **upload your own books (PDF / EPUB / TXT, English & Chinese) and practice typing through them chapter by chapter** — while keeping the clean, low-distraction typing feel of a modern typing test.

It is a **fork of [Monkeytype](https://github.com/monkeytypegame/monkeytype)** ([monkeytype.com](https://monkeytype.com/)). We keep Monkeytype's excellent typing engine and per-second speed curves, and build a "read & type through your own books" product on top of it.

## Relationship to Monkeytype (GPL-3.0)

- This frontend is **derived from Monkeytype** and is distributed under the **GNU GPL-3.0** (same license as upstream). See [`LICENSE`](./LICENSE).
- The upstream project, its copyright notices, and its contributors' credits are **preserved** (see [Credits](#credits)). All original Monkeytype copyright remains with its authors.
- The **frontend stays open-source (GPL-3.0)**. TypeAny's separate **backend** (AI document parsing, accounts, cloud storage, paid features) is a distinct, independently-licensed service and is **not** part of this repository.
- Monkeytype's name and logo are being removed from the product surface; any remaining references are for attribution only.

Upstream: https://github.com/monkeytypegame/monkeytype

## What's different in TypeAny

- **Upload & Type** — bring your own books and type through them by chapter (sequential or random paragraphs).
- **Reading + progress** layer on top of the typing test (bookshelf, chapters, page/paragraph navigation).
- **English + Chinese** typing, with a character model that keeps the caret and error markers stable across mixed-width text.
- Trimmed, focused UI (no ads, no leaderboards/quotes/zen) and a custom visual theme.

Product spec, milestones, and decisions live in [`WORKORDER.md`](./WORKORDER.md); working rules for contributors and AI agents are in [`CLAUDE.md`](./CLAUDE.md).

## Tech stack

Inherited from Monkeytype: SolidJS + TypeScript + Vite + Tailwind + Chart.js, in a pnpm + turbo monorepo. Node 24, pnpm 10.

```bash
pnpm install
pnpm dev-fe   # http://localhost:3000
```

Guest mode works out of the box (accounts disabled); no backend required for local typing.

## Credits

TypeAny stands on the shoulders of **Monkeytype** and its community:

- [Monkeytype](https://github.com/monkeytypegame/monkeytype) by [Miodec](https://github.com/Miodec) and all of its [contributors](https://github.com/monkeytypegame/monkeytype/graphs/contributors), who built the typing engine, themes, and features TypeAny is based on.
- [Montydrei](https://www.reddit.com/user/montydrei) for the original Monkeytype name suggestion, and everyone who gave feedback on the [original prototype post](https://www.reddit.com/r/MechanicalKeyboards/comments/gc6wx3/experimenting_with_a_completely_new_type_of/).

## License

GNU General Public License v3.0 — see [`LICENSE`](./LICENSE). Because TypeAny is a GPL-3.0 derivative of Monkeytype, this frontend's source is and will remain publicly available.
