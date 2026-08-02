import {
  CustomTextSettings,
  CustomTextSettingsSchema,
} from "@monkeytype/schemas/results";
import { createSignal } from "solid-js";
import { z } from "zod";

import { setConfig } from "../config/setters";
import { setCustomTextIndicator } from "../states/core";
import * as CustomText from "../test/custom-text";
import { LocalStorageWithSchema } from "../utils/local-storage-with-schema";
import * as LocalBooks from "./local-books";

/**
 * Keeps book typing and Random Mode apart — see WORKORDER「Random 模式 与
 * 书籍模式 的边界」(2026-08-01).
 *
 * The typing engine only knows how to read `Config.mode` + `CustomText`, so a
 * book round still has to be poured into that slot. What this module adds is a
 * boundary around it: Random's own custom text is stashed on the way in and
 * put back on the way out, so neither side ever sees the other's state.
 * Clicking `custom` on the Random page must never land you in a book, and
 * changing the round length inside a book must never throw you out to random
 * words.
 */

const ACTIVE_BOOK_KEY = "typeanyActiveBook";
const LEAK_CLEANED_KEY = "typeanyBookLeakCleaned";

const stashLS = new LocalStorageWithSchema<CustomTextSettings | null>({
  key: "typeanyRandomCustomStash",
  schema: z.union([CustomTextSettingsSchema, z.null()]),
  fallback: null,
});

const [activeBookName, setActiveBookName] = createSignal<string | null>(
  window.localStorage.getItem(ACTIVE_BOOK_KEY),
);

export { activeBookName };

export function isBookMode(): boolean {
  return activeBookName() !== null;
}

export function getActiveBook(): LocalBooks.Book | undefined {
  const name = activeBookName();
  return name === null ? undefined : LocalBooks.getBook(name);
}

function rememberActiveBook(name: string | null): void {
  if (name === null) {
    window.localStorage.removeItem(ACTIVE_BOOK_KEY);
  } else {
    window.localStorage.setItem(ACTIVE_BOOK_KEY, name);
  }
  setActiveBookName(name);
}

/**
 * Pours one round of the book into the custom-text slot the engine reads.
 * A words round takes the next N words; a time round lays out the rest of the
 * book and lets the clock decide where it stops.
 */
export function applyRound(book: LocalBooks.Book): void {
  const words = LocalBooks.splitWords(book.text);
  const remaining = words.slice(book.progress);

  CustomText.setMode("repeat");
  CustomText.setPipeDelimiter(false);

  if (book.roundMode === "time") {
    CustomText.setText(remaining);
    CustomText.setLimitMode("time");
    CustomText.setLimitValue(book.roundSeconds);
  } else {
    const round = remaining.slice(0, book.roundWords);
    CustomText.setText(round);
    CustomText.setLimitMode("word");
    CustomText.setLimitValue(round.length);
  }

  setCustomTextIndicator({ name: book.name, isLong: true });
  setConfig("mode", "custom");
}

/**
 * Enter book mode. Random's custom text is stashed on the first entry only —
 * going from one book straight to another must not overwrite the stash with a
 * book.
 */
export function startBookSession(book: LocalBooks.Book): void {
  if (!isBookMode()) {
    stashLS.set(CustomText.getData());
  }

  rememberActiveBook(book.name);
  LocalBooks.touchBook(book.name);
  applyRound(book);
}

/**
 * Leave book mode and give Random back the text it had. Safe to call when no
 * book is open.
 */
export function endBookSession(): void {
  if (!isBookMode()) return;

  const stash = stashLS.get();
  rememberActiveBook(null);
  setCustomTextIndicator(undefined);

  if (stash === null) {
    CustomText.resetToDefault();
  } else {
    CustomText.setData(stash);
    stashLS.set(null);
  }
}

/** moves the pointer by whole rounds; returns the book after the move */
export function stepRound(direction: -1 | 1): LocalBooks.Book | undefined {
  const book = getActiveBook();
  if (book === undefined) return undefined;

  const step =
    book.roundMode === "words"
      ? book.roundWords
      : LocalBooks.DEFAULT_ROUND.roundWords;
  LocalBooks.setProgress(book.name, book.progress + direction * step);

  const moved = LocalBooks.getBook(book.name);
  if (moved !== undefined) applyRound(moved);
  return moved;
}

/**
 * One-time cleanup for shelves built before the split (M2c), where opening a
 * book overwrote Random's custom text. The indicator itself is in-memory only,
 * so after a reload all that is left is a custom slot holding the tail of a
 * book — which is why `custom` used to reopen the last book read.
 */
export function clearLegacyBookLeakage(): void {
  if (window.localStorage.getItem(LEAK_CLEANED_KEY) === "1") return;
  window.localStorage.setItem(LEAK_CLEANED_KEY, "1");

  if (isBookMode()) return;

  const current = CustomText.getText().join(" ");
  if (current === "") return;

  const leaked = LocalBooks.getBookNames().some((name) =>
    LocalBooks.getBook(name)?.text.includes(current),
  );

  if (leaked) {
    setCustomTextIndicator(undefined);
    CustomText.resetToDefault();
  }
}
