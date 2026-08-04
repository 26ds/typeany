import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as LocalBooks from "../../src/ts/books/local-books";

/**
 * The range maths behind WORKORDER 进度模型 v2. Worth pinning down: every one of
 * these numbers is shown to the reader as "how much of this book have I read",
 * and an off-by-one here is the kind of thing that quietly inflates or eats a
 * percentage without ever throwing.
 */

const NAME = "test-book";
/** "w0 w1 … w199" — word index == the number in the word */
const TEXT = Array.from({ length: 200 }, (_, i) => `w${i}`).join(" ");

function book(): LocalBooks.Book {
  const found = LocalBooks.getBook(NAME);
  if (found === undefined) throw new Error("book vanished mid-test");
  return found;
}

describe("local-books progress model", () => {
  beforeEach(() => {
    LocalBooks.addBook(NAME, TEXT);
  });

  afterEach(() => {
    LocalBooks.deleteBook(NAME);
  });

  it("starts empty", () => {
    expect(book().done).toEqual([]);
    expect(LocalBooks.getDoneWordCount(book())).toBe(0);
    expect(LocalBooks.getProgressPercentage(book())).toBe(0);
    expect(LocalBooks.getFrontier(book())).toBe(0);
    expect(LocalBooks.getGaps(book())).toEqual([]);
  });

  it("merges rounds that run into each other", () => {
    LocalBooks.settleRound(NAME, 0, 25);
    LocalBooks.settleRound(NAME, 25, 50);

    // two rounds of one unbroken read, not two ranges with a seam
    expect(book().done).toEqual([[0, 50]]);
    expect(LocalBooks.getDoneWordCount(book())).toBe(50);
    expect(LocalBooks.getProgressPercentage(book())).toBe(25);
    expect(LocalBooks.getGaps(book())).toEqual([]);
  });

  it("parks the cursor at the end of the round it settled", () => {
    LocalBooks.settleRound(NAME, 0, 25);
    expect(book().progress).toBe(25);
  });

  it("counts only settled words, not how far the cursor got", () => {
    LocalBooks.settleRound(NAME, 0, 25);
    LocalBooks.setCursor(NAME, 150);

    expect(LocalBooks.getDoneWordCount(book())).toBe(25);
    expect(LocalBooks.getProgressPercentage(book())).toBe(13);
  });

  // the bug the user reported on 2026-08-04: paging back with the ← arrow shrank
  // the percentage, and paging back to the start wiped the book
  it("never lets the cursor shrink what has been read", () => {
    LocalBooks.settleRound(NAME, 0, 100);
    const before = LocalBooks.getProgressPercentage(book());

    for (const cursor of [75, 50, 25, 0]) {
      LocalBooks.setCursor(NAME, cursor);
      expect(LocalBooks.getProgressPercentage(book())).toBe(before);
      expect(LocalBooks.getDoneWordCount(book())).toBe(100);
      expect(LocalBooks.getFrontier(book())).toBe(100);
    }
  });

  it("reports a skipped stretch as a gap behind the frontier", () => {
    LocalBooks.settleRound(NAME, 0, 25);
    LocalBooks.setCursor(NAME, 100);
    LocalBooks.settleRound(NAME, 100, 125);

    expect(book().done).toEqual([
      [0, 25],
      [100, 125],
    ]);
    expect(LocalBooks.getFrontier(book())).toBe(125);
    expect(LocalBooks.getGaps(book())).toEqual([[25, 100]]);
    // unread text past the frontier is not a gap, it is just unread
    expect(LocalBooks.getDoneWordCount(book())).toBe(50);
  });

  describe("dismissing a gap with ✗", () => {
    beforeEach(() => {
      LocalBooks.settleRound(NAME, 0, 25);
      LocalBooks.setCursor(NAME, 100);
      LocalBooks.settleRound(NAME, 100, 125);
    });

    // user decision 2026-08-04: ✗ stops the nagging and nothing else
    it("drops it off the list without counting it as read", () => {
      LocalBooks.dismissGap(NAME, [25, 100]);

      expect(LocalBooks.getGaps(book())).toEqual([]);
      expect(LocalBooks.getDoneWordCount(book())).toBe(50);
      expect(LocalBooks.getProgressPercentage(book())).toBe(25);
    });

    it("takes the dismissal back once that stretch is actually typed", () => {
      LocalBooks.dismissGap(NAME, [25, 100]);
      LocalBooks.settleRound(NAME, 25, 50);

      expect(book().skipped).toEqual([[50, 100]]);
      expect(LocalBooks.getGaps(book())).toEqual([]);
      expect(LocalBooks.getDoneWordCount(book())).toBe(75);
    });
  });

  it("sends 'back to my progress' to the start of the last finished round", () => {
    LocalBooks.setRound(NAME, { roundMode: "words", roundWords: 25 });
    LocalBooks.settleRound(NAME, 0, 25);
    LocalBooks.settleRound(NAME, 25, 50);

    // the two rounds merged into [0,50), but the reader wants the last round
    // back — all white, one → away from new text
    expect(LocalBooks.getLastFinishedStart(book())).toBe(25);
    expect(LocalBooks.getFrontier(book())).toBe(50);
  });

  it("clamps anything past the end of the book", () => {
    LocalBooks.settleRound(NAME, 190, 500);

    expect(book().done).toEqual([[190, 200]]);
    expect(LocalBooks.getDoneWordCount(book())).toBe(10);
  });

  it("ignores a round in which nothing was typed", () => {
    LocalBooks.setCursor(NAME, 40);
    LocalBooks.settleRound(NAME, 40, 40);

    expect(book().done).toEqual([]);
    expect(book().progress).toBe(40);
  });

  it("wipes everything on reset, the one backwards move there is", () => {
    LocalBooks.settleRound(NAME, 0, 50);
    LocalBooks.dismissGap(NAME, [50, 60]);
    LocalBooks.resetProgress(NAME);

    expect(book().done).toEqual([]);
    expect(book().skipped).toEqual([]);
    expect(book().progress).toBe(0);
    expect(LocalBooks.getProgressPercentage(book())).toBe(0);
  });

  it("labels a gap with the words it starts on", () => {
    expect(LocalBooks.getRangePreview(book(), [10, 40])).toBe("w10 w11 w12");
    expect(LocalBooks.getRangePreview(book(), [10, 12])).toBe("w10 w11");
  });
});

describe("migrating a book from before the split", () => {
  beforeEach(() => {
    vi.resetModules();
    window.localStorage.clear();
  });

  it("reads the old pointer as 'the first N words are done'", async () => {
    window.localStorage.setItem(
      "customTextLong",
      JSON.stringify({ old: { text: TEXT, progress: 60, wordCount: 200 } }),
    );

    const Books = await import("../../src/ts/books/local-books");
    const migrated = Books.getBook("old");

    expect(migrated?.done).toEqual([[0, 60]]);
    expect(migrated?.skipped).toEqual([]);
    expect(migrated?.progress).toBe(60);
    // nobody loses a percentage point to the upgrade
    expect(Books.getProgressPercentage(migrated as LocalBooks.Book)).toBe(30);
  });

  it("leaves an untouched book at zero rather than inventing a range", async () => {
    window.localStorage.setItem(
      "customTextLong",
      JSON.stringify({ fresh: { text: TEXT, progress: 0, wordCount: 200 } }),
    );

    const Books = await import("../../src/ts/books/local-books");

    expect(Books.getBook("fresh")?.done).toEqual([]);
  });
});
