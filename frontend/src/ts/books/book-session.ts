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

/**
 * Reactive: re-runs both when the open book changes and when *any* write lands
 * on the shelf, so the config bar follows the round length and the arrows
 * follow the progress the finished test just wrote.
 */
export function getActiveBook(): LocalBooks.Book | undefined {
  LocalBooks.shelfVersion();
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
 * Pours the round starting at the book's cursor into the custom-text slot the
 * engine reads. A words round takes the next N words; a time round lays out the
 * rest of the book and lets the clock decide where it stops.
 *
 * Split out of `applyRound` because a test that is *finishing* has to line up
 * the next round's text without also re-running `setConfig` mid-finish.
 */
/**
 * Which words of the round on screen were already settled in an earlier pass,
 * in round-local indices. Cached rather than derived per word: the renderer
 * asks once per word, and reading the shelf clones every book's full text.
 */
let settledInRound: LocalBooks.Range[] = [];

/**
 * Is this word of the current round one the reader already finished? Those
 * render white, everything else grey — WORKORDER 进度模型 v2「白 / 灰」.
 */
export function isWordSettled(wordIndex: number): boolean {
  return settledInRound.some(
    ([start, end]) => wordIndex >= start && wordIndex < end,
  );
}

function pourRoundText(book: LocalBooks.Book): void {
  settledInRound = book.done
    .map(
      ([start, end]): LocalBooks.Range => [
        start - book.progress,
        end - book.progress,
      ],
    )
    .filter(([, end]) => end > 0);

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
}

/** `pourRoundText` plus the "we are in a book now" state */
export function applyRound(book: LocalBooks.Book): void {
  pourRoundText(book);
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

  settledInRound = [];
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

/** parks the cursor somewhere and lays out the round that starts there */
function moveCursor(name: string, cursor: number): LocalBooks.Book | undefined {
  LocalBooks.setCursor(name, cursor);

  const moved = LocalBooks.getBook(name);
  if (moved !== undefined) applyRound(moved);
  return moved;
}

/**
 * Pages by whole rounds. **Navigation only** — it moves the cursor and nothing
 * else. It used to write the progress field, which is why paging back used to
 * eat the reader's percentage and paging back to the start wiped the book.
 */
export function stepRound(direction: -1 | 1): LocalBooks.Book | undefined {
  const book = getActiveBook();
  if (book === undefined) return undefined;

  let target = book.progress + direction * LocalBooks.getRoundStep(book);

  // coming forward from behind the frontier, stop *on* it rather than
  // overshooting into unread text and leaving a fresh gap behind
  const frontier = LocalBooks.getFrontier(book);
  if (direction === 1 && book.progress < frontier && target > frontier) {
    target = frontier;
  }

  return moveCursor(book.name, target);
}

/**
 * "Back to my progress" — lands on the round that reached the frontier, so it
 * reads all in white and one press of → is new text.
 */
export function jumpToLastFinished(): LocalBooks.Book | undefined {
  const book = getActiveBook();
  if (book === undefined) return undefined;
  return moveCursor(book.name, LocalBooks.getLastFinishedStart(book));
}

/** a gap pill was clicked — go type that stretch */
export function jumpToGap(gap: LocalBooks.Range): LocalBooks.Book | undefined {
  const book = getActiveBook();
  if (book === undefined) return undefined;
  return moveCursor(book.name, gap[0]);
}

/** what settling a round did to the book, so the caller can say so */
export type RoundOutcome =
  | { kind: "advanced"; doneWords: number; totalWords: number }
  | { kind: "gaps-left"; gapCount: number }
  | { kind: "book-finished" };

/**
 * Records a settled round against the book and lines up the next one.
 *
 * Only ever *adds* to what has been read — see WORKORDER「打完一轮 ≠ 打完整本」.
 * Upstream loaded a whole long text as one test, so reaching the end meant the
 * book was done and the pointer went back to 0; on a book read one round at a
 * time that threw away every round already read (reproduced: 2 → 0).
 */
export function settleRound(
  name: string,
  completedWords: number,
  complete: boolean,
): RoundOutcome | undefined {
  const before = LocalBooks.getBook(name);
  if (before === undefined) return undefined;

  LocalBooks.settleRound(
    name,
    before.progress,
    before.progress + completedWords,
    complete,
  );

  const settled = LocalBooks.getBook(name);
  if (settled === undefined) return undefined;

  let outcome: RoundOutcome;
  if (settled.progress >= settled.wordCount) {
    // ran off the end of the book — but the end is not the same as having read
    // all of it, so send them to what they skipped rather than back to word 1
    const gaps = LocalBooks.getGaps(settled);
    const firstGap = gaps[0];

    if (firstGap === undefined) {
      LocalBooks.setCursor(name, 0);
      outcome = { kind: "book-finished" };
    } else {
      LocalBooks.setCursor(name, firstGap[0]);
      outcome = { kind: "gaps-left", gapCount: gaps.length };
    }
  } else {
    outcome = {
      kind: "advanced",
      doneWords: LocalBooks.getDoneWordCount(settled),
      totalWords: settled.wordCount,
    };
  }

  const next = LocalBooks.getBook(name);
  if (next !== undefined) pourRoundText(next);
  return outcome;
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
