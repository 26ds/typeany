import { tryCatchSync } from "@monkeytype/util/trycatch";
import { createSignal } from "solid-js";
import { z } from "zod";

import { LocalStorageWithSchema } from "../utils/local-storage-with-schema";

/**
 * The local (guest) bookshelf. Every saved text is a book carrying a
 * word-level progress pointer — see WORKORDER 已定决策 D1 (2026-07-31) and
 * docs/plans/M2.md.
 *
 * Books live under the upstream `customTextLong` key so anything saved before
 * the fork keeps working. This module is the **only** reader/writer of that
 * key: `test/custom-text.ts` delegates here, because its old
 * `{ text, progress }` zod object would strip the extra fields on every
 * read-modify-write of the progress pointer.
 */

/**
 * How many gap pills a book card shows before it stops listing them. Past this
 * many unfinished stretches the card shows a `+N` that opens the full list
 * (user decision 2026-08-04).
 */
export const MAX_GAP_PILLS = 6;

/**
 * How many attempts one stretch keeps. A stretch typed over and over must not
 * grow the shelf without bound — localStorage has no room to spare and a failed
 * write is silent.
 */
export const MAX_ATTEMPTS_PER_RANGE = 10;
/** and a ceiling across the whole book, for a reader who retypes everywhere */
export const MAX_ATTEMPTS_PER_BOOK = 100;

/**
 * How many round boundaries a book keeps. Enough for a very long book read in
 * small rounds; past it the oldest go, which costs nothing but the ability to
 * retype those old rounds as fixed blocks — the reading itself is in `done`.
 */
export const MAX_BLOCKS = 1000;

/** how long one round of this book is — WORKORDER 回合设置, per book */
export const ROUND_WORD_OPTIONS = [25, 50, 100, 200] as const;
export const ROUND_TIME_OPTIONS = [15, 30, 60, 120] as const;
export const DEFAULT_ROUND = {
  roundMode: "words" as const,
  roundWords: 25,
  roundSeconds: 30,
};

/** a half-open word range `[start, end)` — see WORKORDER 进度模型 v2 */
const RangeSchema = z.tuple([
  z.number().int().nonnegative(),
  z.number().int().nonnegative(),
]);
export type Range = z.infer<typeof RangeSchema>;

/**
 * One settled round, kept in the order it happened and **never merged** —
 * WORKORDER 进度模型 v3「模块(block)」.
 *
 * `done` merges everything that touches, which is right for "how much of this
 * book have I read" and useless for "where did the last round end". Without
 * these boundaries there is no way to tell a round typed to the full 25 words
 * from one abandoned after 9, and the reader gets sent back to retype half a
 * round they never asked to do again (reported 2026-08-14).
 */
const BlockSchema = z.object({
  range: RangeSchema,
  /** typed to the end of its target: the full word count, or the clock ran out */
  complete: z.boolean(),
});
export type Block = z.infer<typeof BlockSchema>;

/** enough of a finished attempt to rebuild its result screen */
const AttemptStatsSchema = z.object({
  wpm: z.number().nonnegative(),
  rawWpm: z.number().nonnegative(),
  acc: z.number().nonnegative(),
  consistency: z.number().nonnegative(),
  /** correct / incorrect / extra / missed — the four the result screen shows */
  charStats: z.tuple([
    z.number().int().nonnegative(),
    z.number().int().nonnegative(),
    z.number().int().nonnegative(),
    z.number().int().nonnegative(),
  ]),
  /** the per-second curve, when there was one worth keeping */
  chart: z
    .object({
      wpm: z.array(z.number().nonnegative()),
      raw: z.array(z.number().nonnegative()),
      err: z.array(z.number().nonnegative()),
    })
    .optional(),
});
export type AttemptStats = z.infer<typeof AttemptStatsSchema>;

/**
 * One pass over a stretch the reader had already read — WORKORDER 进度模型 v3.
 *
 * Retyping never touches `done`, so none of this moves the percentage: it is a
 * record of *how* a stretch went, kept beside the book rather than inside its
 * score. An attempt with no `finishedAt` was left partway through and is
 * somewhere the reader can go back to; one with a `finishedAt` is a souvenir.
 */
const AttemptSchema = z.object({
  id: z.string(),
  /** the words this pass covers — fixed when it starts, never grows */
  range: RangeSchema,
  /**
   * The round setting it was started under. Stored rather than read off the
   * book, because the reader can change the round length afterwards and this
   * record still has to say what it was measuring — and a paused time attempt
   * needs its own clock back when it resumes.
   */
  limit: z.object({
    mode: z.enum(["words", "time"]),
    value: z.number().positive(),
  }),
  /** how far into `range` this pass got */
  typedWords: z.number().int().nonnegative(),
  /** time actually spent typing; paused and away time is not in here */
  activeMs: z.number().nonnegative(),
  startedAt: z.number().nonnegative(),
  finishedAt: z.number().nonnegative().optional(),
  stats: AttemptStatsSchema.optional(),
});
export type Attempt = z.infer<typeof AttemptSchema>;

const StoredBookSchema = z.object({
  text: z.string(),
  /**
   * **The reading cursor only** — which word the next round starts on.
   *
   * It used to mean both "where I am" and "how much I have done", which is why
   * paging back with the ← arrow used to shrink the percentage and paging back
   * to the start wiped the book (user report 2026-08-04). How much is done now
   * lives in `done`, and nothing but `resetProgress` may shrink that.
   *
   * Kept under the name `progress` because it is upstream's `customTextLong`
   * field: `test/custom-text.ts` and `applyRound()` both read it.
   */
  progress: z.number().int().nonnegative(),
  /** settled word ranges — sorted, non-overlapping, merged. These render white */
  done: z.array(RangeSchema),
  /** gaps dismissed with ✗ — still unread and still grey, just no longer listed */
  skipped: z.array(RangeSchema),
  /**
   * How far into the book the reader has ever got — a **high-water mark**.
   *
   * It exists because refresh used to take a stretch back out of `done`, which
   * would otherwise have pulled the frontier back with it and made the hole
   * vanish. 进度模型 v3 (2026-08-14) dropped that, so today nothing shrinks
   * `done` short of a full reset and this tracks its end. Kept anyway: books
   * already on shelves carry it, and it is the only place a "hand this stretch
   * back" feature could ever hang.
   */
  frontier: z.number().int().nonnegative(),
  /** every settled round, in order, unmerged — see `BlockSchema` */
  blocks: z.array(BlockSchema),
  /** passes over stretches already read — see `AttemptSchema` */
  attempts: z.array(AttemptSchema),
  wordCount: z.number().int().nonnegative(),
  createdAt: z.number().nonnegative(),
  lastOpenedAt: z.number().nonnegative(),
  roundMode: z.enum(["words", "time"]),
  roundWords: z.number().int().positive(),
  roundSeconds: z.number().int().positive(),
});
type StoredBook = z.infer<typeof StoredBookSchema>;

const BookshelfSchema = z.record(z.string(), StoredBookSchema);
type Bookshelf = z.infer<typeof BookshelfSchema>;

export type Book = StoredBook & { name: string };

/** upstream's pre-fork bookshelf entry — everything but `text` is optional */
const LegacyBookSchema = z.object({
  text: z.string(),
  progress: z.number().nonnegative().optional(),
  done: z.array(RangeSchema).optional(),
  skipped: z.array(RangeSchema).optional(),
  frontier: z.number().nonnegative().optional(),
  // forgiving on purpose: a single malformed attempt must not cost the reader
  // the book it is attached to, and the whole point of the migration path is
  // that it never drops text
  attempts: z.array(AttemptSchema).catch([]).optional(),
  blocks: z.array(BlockSchema).catch([]).optional(),
  wordCount: z.number().nonnegative().optional(),
  createdAt: z.number().nonnegative().optional(),
  lastOpenedAt: z.number().nonnegative().optional(),
  roundMode: z.enum(["words", "time"]).optional(),
  roundWords: z.number().positive().optional(),
  roundSeconds: z.number().positive().optional(),
});

const LegacyShortTextsSchema = z.record(z.string(), z.string());

const LEGACY_SHORT_TEXTS_KEY = "customText";
const SHORT_TEXTS_IMPORTED_KEY = "typeanyShortTextsImported";

/**
 * Same split upstream uses to turn a stored text back into words, minus the
 * empty strings a leading/double space would produce — those would otherwise
 * shift the progress pointer off by one.
 */
export function splitWords(text: string): string[] {
  return text.split(/ +/).filter((word) => word !== "");
}

function clampProgress(progress: number, wordCount: number): number {
  return Math.min(Math.max(Math.floor(progress), 0), wordCount);
}

/* ---- word ranges ------------------------------------------------------- *
 * All three are pure and total: hand them anything, get back a sorted,
 * non-overlapping, in-bounds list. Everything the reader sees — the white
 * percentage, the frontier, the gap pills — is derived from these, so a stray
 * overlapping range would double-count words straight into the percentage.  */

/** clamps into the book, drops empties, sorts, and merges anything touching */
function normalizeRanges(ranges: Range[], wordCount: number): Range[] {
  const clamped = ranges
    .map(
      ([start, end]): Range => [
        clampProgress(start, wordCount),
        clampProgress(end, wordCount),
      ],
    )
    .filter(([start, end]) => end > start)
    .sort((a, b) => a[0] - b[0]);

  const merged: Range[] = [];
  for (const [start, end] of clamped) {
    const last = merged.at(-1);
    // `<=`, not `<`: [0,25) then [25,50) is one unbroken read, not two rounds
    // with a zero-width hole between them
    if (last !== undefined && start <= last[1]) {
      last[1] = Math.max(last[1], end);
    } else {
      merged.push([start, end]);
    }
  }

  return merged;
}

/** whatever is left of `ranges` once `[cutStart, cutEnd)` is taken out */
function subtractRange(ranges: Range[], [cutStart, cutEnd]: Range): Range[] {
  const kept: Range[] = [];

  for (const [start, end] of ranges) {
    if (start < cutStart) kept.push([start, Math.min(end, cutStart)]);
    if (end > cutEnd) kept.push([Math.max(start, cutEnd), end]);
  }

  return kept.filter(([start, end]) => end > start);
}

/** how many words a list of ranges covers */
function rangeTotal(ranges: Range[]): number {
  return ranges.reduce((total, [start, end]) => total + (end - start), 0);
}

/** the holes `ranges` leaves in `[0, end)`; `ranges` must be normalized */
function invertRanges(ranges: Range[], end: number): Range[] {
  const holes: Range[] = [];
  let at = 0;

  for (const [rangeStart, rangeEnd] of ranges) {
    if (rangeStart >= end) break;
    if (rangeStart > at) holes.push([at, rangeStart]);
    at = Math.max(at, rangeEnd);
  }
  if (at < end) holes.push([at, end]);

  return holes;
}

function migrateShelf(oldData: Record<string, unknown> | unknown[]): Bookshelf {
  const migrated: Bookshelf = {};

  if (Array.isArray(oldData) || typeof oldData !== "object") {
    return migrated;
  }

  const now = Date.now();
  for (const [name, value] of Object.entries(oldData)) {
    const parsed = LegacyBookSchema.safeParse(value);
    if (!parsed.success) {
      // no text to recover — dropping the entry is the only option
      continue;
    }

    const text = parsed.data.text;
    const wordCount = Math.floor(
      parsed.data.wordCount ?? splitWords(text).length,
    );

    const cursor = clampProgress(parsed.data.progress ?? 0, wordCount);
    // A book from before 进度模型 v2 was read strictly forward, so "the cursor
    // is at N" and "the first N words are settled" said the same thing. Nobody
    // loses a percentage point to the upgrade.
    const done = normalizeRanges(parsed.data.done ?? [[0, cursor]], wordCount);

    migrated[name] = {
      text,
      progress: cursor,
      done,
      skipped: normalizeRanges(parsed.data.skipped ?? [], wordCount),
      frontier: clampProgress(
        Math.max(parsed.data.frontier ?? 0, done.at(-1)?.[1] ?? 0, cursor),
        wordCount,
      ),
      attempts: parsed.data.attempts ?? [],
      // A book from before the boundaries existed has none to recover. An empty
      // list reads as "no complete block behind me", which lands a resume on the
      // leftoff word — never on words the reader would have to type twice.
      blocks: parsed.data.blocks ?? [],
      wordCount,
      createdAt: parsed.data.createdAt ?? now,
      lastOpenedAt: parsed.data.lastOpenedAt ?? now,
      roundMode: parsed.data.roundMode ?? DEFAULT_ROUND.roundMode,
      roundWords: Math.floor(
        parsed.data.roundWords ?? DEFAULT_ROUND.roundWords,
      ),
      roundSeconds: Math.floor(
        parsed.data.roundSeconds ?? DEFAULT_ROUND.roundSeconds,
      ),
    };
  }

  return migrated;
}

const bookshelfLS = new LocalStorageWithSchema({
  key: "customTextLong",
  schema: BookshelfSchema,
  fallback: {},
  migrate: migrateShelf,
});

/**
 * D1 merged "short saved text" and "book" into one thing, so pull whatever is
 * left in the old `customText` key onto the shelf as a book at progress 0.
 * Runs once — the legacy key is left alone (SaveCustomText/SavedTexts still
 * write it until M2c) and the flag keeps a deleted book from reappearing.
 */
function importLegacyShortTexts(): void {
  if (window.localStorage.getItem(SHORT_TEXTS_IMPORTED_KEY) === "1") return;

  const raw = window.localStorage.getItem(LEGACY_SHORT_TEXTS_KEY);
  if (raw !== null) {
    const { data: json } = tryCatchSync(() => JSON.parse(raw) as unknown);
    const parsed = LegacyShortTextsSchema.safeParse(json);

    if (parsed.success) {
      const shelf = bookshelfLS.get();
      const now = Date.now();
      let imported = 0;

      for (const [name, text] of Object.entries(parsed.data)) {
        // a real book already owns this name — leave it be
        if (shelf[name] !== undefined) continue;

        shelf[name] = {
          text,
          progress: 0,
          done: [],
          skipped: [],
          frontier: 0,
          attempts: [],
          blocks: [],
          wordCount: splitWords(text).length,
          createdAt: now,
          lastOpenedAt: now,
          ...DEFAULT_ROUND,
        };
        imported++;
      }

      // if the write failed (quota), stay unflagged and retry next time
      if (imported > 0 && !bookshelfLS.set(shelf)) return;
    }
  }

  window.localStorage.setItem(SHORT_TEXTS_IMPORTED_KEY, "1");
}

/**
 * Bumped after every successful write. The shelf lives in localStorage, which
 * Solid cannot see changing — so anything that reads a book inside a reactive
 * scope has to subscribe to this too. Without it the book config bar only ever
 * repainted by accident, when some unrelated signal happened to force it: the
 * round-length pills looked dead, and switching to `time` left the seconds
 * options hidden behind the stale word options.
 */
const [shelfVersion, bumpShelfVersion] = createSignal(0);
export { shelfVersion };

function save(shelf: Bookshelf): boolean {
  const saved = bookshelfLS.set(shelf);
  if (saved) bumpShelfVersion((version) => version + 1);
  return saved;
}

let legacyImportChecked = false;

function readShelf(): Bookshelf {
  if (!legacyImportChecked) {
    legacyImportChecked = true;
    importLegacyShortTexts();
  }
  return bookshelfLS.get();
}

/** most recently opened first */
export function listBooks(): Book[] {
  return Object.entries(readShelf())
    .map(([name, book]) => ({ name, ...book }))
    .sort(
      (a, b) => b.lastOpenedAt - a.lastOpenedAt || b.createdAt - a.createdAt,
    );
}

export function getBookNames(): string[] {
  return Object.keys(readShelf());
}

export function getBook(name: string): Book | undefined {
  const book = readShelf()[name];
  return book === undefined ? undefined : { name, ...book };
}

/** the whole book as words — slice by `progress` to resume */
export function getBookWords(name: string): string[] | undefined {
  const book = readShelf()[name];
  return book === undefined ? undefined : splitWords(book.text);
}

/** creates the book, or replaces the text of an existing one (progress resets) */
export function addBook(name: string, text: string | string[]): boolean {
  const shelf = readShelf();
  const joined = typeof text === "string" ? text : text.join(" ");
  const now = Date.now();

  shelf[name] = {
    text: joined,
    progress: 0,
    done: [],
    skipped: [],
    frontier: 0,
    attempts: [],
    blocks: [],
    wordCount: splitWords(joined).length,
    createdAt: shelf[name]?.createdAt ?? now,
    lastOpenedAt: now,
    roundMode: shelf[name]?.roundMode ?? DEFAULT_ROUND.roundMode,
    roundWords: shelf[name]?.roundWords ?? DEFAULT_ROUND.roundWords,
    roundSeconds: shelf[name]?.roundSeconds ?? DEFAULT_ROUND.roundSeconds,
  };

  return save(shelf);
}

export function deleteBook(name: string): boolean {
  const shelf = readShelf();
  if (shelf[name] === undefined) return false;

  // oxlint-disable-next-line no-dynamic-delete
  delete shelf[name];
  return save(shelf);
}

export function renameBook(oldName: string, newName: string): boolean {
  const shelf = readShelf();
  const book = shelf[oldName];
  if (book === undefined || shelf[newName] !== undefined) return false;

  // oxlint-disable-next-line no-dynamic-delete
  delete shelf[oldName];
  shelf[newName] = book;
  return save(shelf);
}

/**
 * Moves the reading cursor. **Never touches `done`** — paging around a book is
 * navigation, not a change to what you have read. This is the whole of the fix
 * for "the ← arrow shrinks my percentage".
 */
export function setCursor(name: string, cursor: number): boolean {
  const shelf = readShelf();
  const book = shelf[name];
  if (book === undefined) return false;

  book.progress = clampProgress(cursor, book.wordCount);
  return save(shelf);
}

/**
 * Records `[start, end)` as read and parks the cursor at the end of it.
 * Called once per settled round — a round that ended on the result screen,
 * whether it ran out of words or the reader stopped it with shift+enter.
 * Restarting with the refresh button settles nothing.
 */
export function settleRound(
  name: string,
  start: number,
  end: number,
  complete: boolean,
): boolean {
  const shelf = readShelf();
  const book = shelf[name];
  if (book === undefined) return false;

  const settled: Range = [
    clampProgress(start, book.wordCount),
    clampProgress(end, book.wordCount),
  ];
  // nothing was typed — leave the cursor where the reader left it
  if (settled[1] <= settled[0]) return true;

  // the boundary goes in unmerged: `done` answers "how much", this answers
  // "where did that round start and did it finish"
  book.blocks = [...book.blocks, { range: settled, complete }].slice(
    -MAX_BLOCKS,
  );
  book.done = normalizeRanges([...book.done, settled], book.wordCount);
  // going back and typing a stretch you had dismissed means you want it back
  book.skipped = subtractRange(book.skipped, settled);
  book.frontier = Math.max(book.frontier, settled[1]);
  book.progress = settled[1];

  return save(shelf);
}

/* ---- attempts: typing a stretch again ---------------------------------- *
 * WORKORDER 进度模型 v3 (2026-08-14). None of this touches `done`, `skipped` or
 * `frontier` — typing a stretch a second time is a thing that happened, not a
 * change to how much of the book has been read. Between 2026-08-05 and this
 * date refresh did take the round back out of `done`; that is gone, and the
 * percentage now only ever moves for `settleRound` and `resetProgress`.       */

function sameRange(a: Range, b: Range): boolean {
  return a[0] === b[0] && a[1] === b[1];
}

function isFinished(attempt: Attempt): boolean {
  return attempt.finishedAt !== undefined;
}

/**
 * Drops the least useful records once a stretch — or the book — holds more than
 * it should. A finished attempt is a souvenir; an unfinished one is somewhere
 * the reader can still pick up, so finished ones go first and oldest first.
 * The attempt just written is never the one dropped: resuming a long-abandoned
 * pass and finishing it would otherwise delete it on the spot for being both
 * finished and the oldest of its group.
 */
function capAttempts(attempts: Attempt[], justSaved: Attempt): Attempt[] {
  const evictionOrder = (candidates: Attempt[], excess: number): string[] =>
    // nothing over the limit means nothing to drop — and `excess` has to be
    // stopped here rather than left to `slice`, which reads a negative end as
    // "count back from the end" and would happily throw away most of the list
    excess <= 0
      ? []
      : candidates
          .filter((attempt) => attempt.id !== justSaved.id)
          .sort(
            (a, b) =>
              Number(isFinished(b)) - Number(isFinished(a)) ||
              a.startedAt - b.startedAt,
          )
          .slice(0, excess)
          .map((attempt) => attempt.id);

  const doomed = new Set<string>();

  const group = attempts.filter((attempt) =>
    sameRange(attempt.range, justSaved.range),
  );
  for (const id of evictionOrder(
    group,
    group.length - MAX_ATTEMPTS_PER_RANGE,
  )) {
    doomed.add(id);
  }

  const left = attempts.filter((attempt) => !doomed.has(attempt.id));
  for (const id of evictionOrder(left, left.length - MAX_ATTEMPTS_PER_BOOK)) {
    doomed.add(id);
  }

  return attempts.filter((attempt) => !doomed.has(attempt.id));
}

export function newAttemptId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Writes an attempt, replacing the one with the same `id`. The caller owns the
 * running totals — `activeMs` is set, not added to — so saving the same pass
 * twice cannot double its time.
 */
export function saveAttempt(name: string, attempt: Attempt): boolean {
  const shelf = readShelf();
  const book = shelf[name];
  if (book === undefined) return false;

  const others = book.attempts.filter((other) => other.id !== attempt.id);
  book.attempts = capAttempts([...others, attempt], attempt);
  return save(shelf);
}

/**
 * The ✗ on an attempt: forgets that pass and nothing else (user 2026-08-14
 * 「点击 ✗,这个胶囊立刻消失,后台数据也随之消失」). The words themselves were
 * already read, so the percentage does not move either way.
 */
export function deleteAttempt(name: string, id: string): boolean {
  const shelf = readShelf();
  const book = shelf[name];
  if (book === undefined) return false;

  const kept = book.attempts.filter((attempt) => attempt.id !== id);
  if (kept.length === book.attempts.length) return false;

  book.attempts = kept;
  return save(shelf);
}

/**
 * The ✗ on a gap pill. Drops the gap off the to-do list and **nothing else** —
 * those words stay unread, stay grey, and the percentage does not move
 * (user decision 2026-08-04). The dialog carrying the ✗ has to say so.
 */
export function dismissGap(name: string, gap: Range): boolean {
  const shelf = readShelf();
  const book = shelf[name];
  if (book === undefined) return false;

  book.skipped = normalizeRanges([...book.skipped, gap], book.wordCount);
  return save(shelf);
}

export function setRound(
  name: string,
  round: Partial<Pick<StoredBook, "roundMode" | "roundWords" | "roundSeconds">>,
): boolean {
  const shelf = readShelf();
  const book = shelf[name];
  if (book === undefined) return false;

  Object.assign(book, round);
  return save(shelf);
}

/** how many words this round covers; time rounds are open-ended */
export function getRoundLength(book: Book): number {
  return book.roundMode === "words" ? book.roundWords : book.wordCount;
}

/**
 * How far one press of an arrow moves. A time round has no word count until it
 * is typed, so it borrows the default — same figure the arrows have always
 * paged by.
 */
export function getRoundStep(book: Book): number {
  return book.roundMode === "words"
    ? book.roundWords
    : DEFAULT_ROUND.roundWords;
}

/** the one and only way the white percentage is allowed to go down */
export function resetProgress(name: string): boolean {
  const shelf = readShelf();
  const book = shelf[name];
  if (book === undefined) return false;

  book.progress = 0;
  book.done = [];
  book.skipped = [];
  book.frontier = 0;
  // the records point at stretches that are about to stop being read at all
  book.attempts = [];
  book.blocks = [];
  return save(shelf);
}

/** bumps the book to the front of the shelf */
export function touchBook(name: string): boolean {
  const shelf = readShelf();
  const book = shelf[name];
  if (book === undefined) return false;

  book.lastOpenedAt = Date.now();
  return save(shelf);
}

/* ---- derived: everything the reader is shown --------------------------- */

/** words actually settled — the white ones */
export function getDoneWordCount(book: Book): number {
  return rangeTotal(book.done);
}

/**
 * The furthest word the reader has ever reached. Only `resetProgress` moves it
 * backwards — not the arrows (that was the reported bug), and not retyping a
 * stretch, which records an attempt and leaves the reading alone.
 */
export function getFrontier(book: Book): number {
  return Math.max(book.frontier, book.done.at(-1)?.[1] ?? 0);
}

/** the end of the last stretch actually read, which is not always the frontier */
function getDoneEnd(book: Book): number {
  return book.done.at(-1)?.[1] ?? 0;
}

/**
 * Stretches behind the frontier that were never settled: skipped over, or
 * started and then restarted without a result. Anything *past* the frontier is
 * simply not read yet and is not a gap. `skipped` ranges are ✗'d out of the
 * list without becoming done.
 */
export function getGaps(book: Book): Range[] {
  const frontier = getFrontier(book);
  if (frontier === 0) return [];

  return invertRanges(
    normalizeRanges([...book.done, ...book.skipped], book.wordCount),
    frontier,
  );
}

/**
 * Where "back to my progress" lands: the start of the round that reached the
 * frontier, so the reader sees that round all in white and one press of → puts
 * them on new text (WORKORDER 进度模型 v2「回到进度」).
 */
export function getLastFinishedStart(book: Book): number {
  const lastBlock = book.blocks.at(-1);

  if (lastBlock !== undefined) {
    // A round left unfinished is not somewhere to go *back* to — it is where the
    // reader stopped. Landing on its start would make them retype the half they
    // just did, which is exactly what they reported on 2026-08-14. Land on the
    // word after it and let them carry on.
    return lastBlock.complete ? lastBlock.range[0] : lastBlock.range[1];
  }

  // a book read before the boundaries existed: the end of the reading is always
  // safe, because it never asks anyone to type the same words twice
  return getDoneEnd(book);
}

/** the block the cursor is standing in, most recent first */
function getBlockAt(book: Book, cursor: number): Block | undefined {
  return book.blocks
    .filter(({ range }) => cursor >= range[0] && cursor < range[1])
    .at(-1);
}

/** the first few words of a range, for a gap pill's label */
export function getRangePreview(book: Book, [start, end]: Range): string {
  return splitWords(book.text)
    .slice(start, Math.min(start + 3, end))
    .join(" ");
}

/**
 * The stretch that typing here would go over again, or `undefined` when typing
 * here means ordinary progress.
 *
 * **A retype is a whole round done again**, so it is bounded by the block the
 * reader is standing in and only counts when that block was finished
 * (user 2026-08-14「如果上次完成了一个模块的完整的…那就应该固定这些的打的字来
 * 给予重打」). Standing on the tail of a round nobody finished is not a retype
 * at all — there is nothing there to compare against, and the words still owe
 * the reader ordinary progress.
 *
 * **The end of the block is a hard stop**(「打完上次打得就停吧」): asking for 50
 * words over a 25-word block types 25 and ends there. A round that were half
 * retype and half new reading would have to settle a muddle, and an attempt
 * that covered different words each time would compare nothing.
 */
export function getRetypeRange(book: Book): Range | undefined {
  const block = getBlockAt(book, book.progress);
  if (block === undefined || !block.complete) return undefined;

  // a time round has no length of its own: the clock stops it early, the end of
  // the block stops it late
  const wanted =
    book.roundMode === "words"
      ? book.progress + book.roundWords
      : block.range[1];

  return [book.progress, Math.min(wanted, block.range[1])];
}

/** was this pass left partway through, and so somewhere to go back to? */
export function isAttemptFinished(attempt: Attempt): boolean {
  return isFinished(attempt);
}

/**
 * Attempts touching a stretch, oldest first — which is the order they are
 * numbered in, so the badge reads 1, 2, 3 in the order they were typed.
 */
export function getAttemptsOverlapping(
  book: Book,
  [start, end]: Range,
): Attempt[] {
  return book.attempts
    .filter((attempt) => attempt.range[0] < end && attempt.range[1] > start)
    .sort((a, b) => a.startedAt - b.startedAt);
}

/** every pass left partway through — the ones with somewhere to go back to */
export function getUnfinishedAttempts(book: Book): Attempt[] {
  return book.attempts
    .filter((attempt) => !isFinished(attempt))
    .sort((a, b) => a.startedAt - b.startedAt);
}

export function getFinishedAttempts(book: Book): Attempt[] {
  return book.attempts
    .filter(isFinished)
    .sort((a, b) => a.startedAt - b.startedAt);
}

/**
 * What is left on the clock of a paused time attempt. Away time is not spent
 * time: a 15 second round paused after 9 seconds comes back with 6, whether
 * that is a minute later or next week.
 */
export function getAttemptRemainingMs(attempt: Attempt): number | undefined {
  if (attempt.limit.mode !== "time") return undefined;
  return Math.max(0, attempt.limit.value * 1000 - attempt.activeMs);
}

/** the white share of the book — WORKORDER「百分比 = 白字 ÷ 全书词数」 */
export function getProgressPercentage(book: Book): number {
  if (book.wordCount === 0) return 0;
  return Math.min(
    100,
    Math.round((getDoneWordCount(book) / book.wordCount) * 100),
  );
}
