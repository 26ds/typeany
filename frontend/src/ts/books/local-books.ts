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

    migrated[name] = {
      text,
      progress: cursor,
      // A book from before 进度模型 v2 was read strictly forward, so "the
      // cursor is at N" and "the first N words are settled" said the same
      // thing. Nobody loses a percentage point to the upgrade.
      done: normalizeRanges(parsed.data.done ?? [[0, cursor]], wordCount),
      skipped: normalizeRanges(parsed.data.skipped ?? [], wordCount),
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
export function settleRound(name: string, start: number, end: number): boolean {
  const shelf = readShelf();
  const book = shelf[name];
  if (book === undefined) return false;

  const settled: Range = [
    clampProgress(start, book.wordCount),
    clampProgress(end, book.wordCount),
  ];
  // nothing was typed — leave the cursor where the reader left it
  if (settled[1] <= settled[0]) return true;

  book.done = normalizeRanges([...book.done, settled], book.wordCount);
  // going back and typing a stretch you had dismissed means you want it back
  book.skipped = subtractRange(book.skipped, settled);
  book.progress = settled[1];

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

/** the one and only way the white percentage is allowed to go down */
export function resetProgress(name: string): boolean {
  const shelf = readShelf();
  const book = shelf[name];
  if (book === undefined) return false;

  book.progress = 0;
  book.done = [];
  book.skipped = [];
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
  return book.done.reduce((total, [start, end]) => total + (end - start), 0);
}

/**
 * The furthest word ever settled. Only `resetProgress` moves it backwards —
 * paging around with the arrows must not, which is the point of the split.
 */
export function getFrontier(book: Book): number {
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
  const frontier = getFrontier(book);
  if (frontier === 0) return 0;

  const lastRunStart = book.done.at(-1)?.[0] ?? 0;
  return Math.max(lastRunStart, frontier - getRoundLength(book));
}

/** the first few words of a range, for a gap pill's label */
export function getRangePreview(book: Book, [start, end]: Range): string {
  return splitWords(book.text)
    .slice(start, Math.min(start + 3, end))
    .join(" ");
}

/** the white share of the book — WORKORDER「百分比 = 白字 ÷ 全书词数」 */
export function getProgressPercentage(book: Book): number {
  if (book.wordCount === 0) return 0;
  return Math.min(
    100,
    Math.round((getDoneWordCount(book) / book.wordCount) * 100),
  );
}
