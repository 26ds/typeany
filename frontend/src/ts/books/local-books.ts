import { tryCatchSync } from "@monkeytype/util/trycatch";
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

const StoredBookSchema = z.object({
  text: z.string(),
  /** how many words of `text` are already done */
  progress: z.number().int().nonnegative(),
  wordCount: z.number().int().nonnegative(),
  createdAt: z.number().nonnegative(),
  lastOpenedAt: z.number().nonnegative(),
});
type StoredBook = z.infer<typeof StoredBookSchema>;

const BookshelfSchema = z.record(z.string(), StoredBookSchema);
type Bookshelf = z.infer<typeof BookshelfSchema>;

export type Book = StoredBook & { name: string };

/** upstream's pre-fork bookshelf entry — everything but `text` is optional */
const LegacyBookSchema = z.object({
  text: z.string(),
  progress: z.number().nonnegative().optional(),
  wordCount: z.number().nonnegative().optional(),
  createdAt: z.number().nonnegative().optional(),
  lastOpenedAt: z.number().nonnegative().optional(),
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

    migrated[name] = {
      text,
      progress: clampProgress(parsed.data.progress ?? 0, wordCount),
      wordCount,
      createdAt: parsed.data.createdAt ?? now,
      lastOpenedAt: parsed.data.lastOpenedAt ?? now,
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
          wordCount: splitWords(text).length,
          createdAt: now,
          lastOpenedAt: now,
        };
        imported++;
      }

      // if the write failed (quota), stay unflagged and retry next time
      if (imported > 0 && !bookshelfLS.set(shelf)) return;
    }
  }

  window.localStorage.setItem(SHORT_TEXTS_IMPORTED_KEY, "1");
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
    wordCount: splitWords(joined).length,
    createdAt: shelf[name]?.createdAt ?? now,
    lastOpenedAt: now,
  };

  return bookshelfLS.set(shelf);
}

export function deleteBook(name: string): boolean {
  const shelf = readShelf();
  if (shelf[name] === undefined) return false;

  // oxlint-disable-next-line no-dynamic-delete
  delete shelf[name];
  return bookshelfLS.set(shelf);
}

export function renameBook(oldName: string, newName: string): boolean {
  const shelf = readShelf();
  const book = shelf[oldName];
  if (book === undefined || shelf[newName] !== undefined) return false;

  // oxlint-disable-next-line no-dynamic-delete
  delete shelf[oldName];
  shelf[newName] = book;
  return bookshelfLS.set(shelf);
}

export function setProgress(name: string, progress: number): boolean {
  const shelf = readShelf();
  const book = shelf[name];
  if (book === undefined) return false;

  book.progress = clampProgress(progress, book.wordCount);
  return bookshelfLS.set(shelf);
}

export function resetProgress(name: string): boolean {
  return setProgress(name, 0);
}

/** bumps the book to the front of the shelf */
export function touchBook(name: string): boolean {
  const shelf = readShelf();
  const book = shelf[name];
  if (book === undefined) return false;

  book.lastOpenedAt = Date.now();
  return bookshelfLS.set(shelf);
}

export function getProgressPercentage(book: Book): number {
  if (book.wordCount === 0) return 0;
  return Math.min(100, Math.round((book.progress / book.wordCount) * 100));
}
