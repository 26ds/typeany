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
    LocalBooks.settleRound(NAME, 0, 25, true);
    LocalBooks.settleRound(NAME, 25, 50, true);

    // two rounds of one unbroken read, not two ranges with a seam
    expect(book().done).toEqual([[0, 50]]);
    expect(LocalBooks.getDoneWordCount(book())).toBe(50);
    expect(LocalBooks.getProgressPercentage(book())).toBe(25);
    expect(LocalBooks.getGaps(book())).toEqual([]);
  });

  it("parks the cursor at the end of the round it settled", () => {
    LocalBooks.settleRound(NAME, 0, 25, true);
    expect(book().progress).toBe(25);
  });

  it("counts only settled words, not how far the cursor got", () => {
    LocalBooks.settleRound(NAME, 0, 25, true);
    LocalBooks.setCursor(NAME, 150);

    expect(LocalBooks.getDoneWordCount(book())).toBe(25);
    expect(LocalBooks.getProgressPercentage(book())).toBe(13);
  });

  // the bug the user reported on 2026-08-04: paging back with the ← arrow shrank
  // the percentage, and paging back to the start wiped the book
  it("never lets the cursor shrink what has been read", () => {
    LocalBooks.settleRound(NAME, 0, 100, true);
    const before = LocalBooks.getProgressPercentage(book());

    for (const cursor of [75, 50, 25, 0]) {
      LocalBooks.setCursor(NAME, cursor);
      expect(LocalBooks.getProgressPercentage(book())).toBe(before);
      expect(LocalBooks.getDoneWordCount(book())).toBe(100);
      expect(LocalBooks.getFrontier(book())).toBe(100);
    }
  });

  it("reports a skipped stretch as a gap behind the frontier", () => {
    LocalBooks.settleRound(NAME, 0, 25, true);
    LocalBooks.setCursor(NAME, 100);
    LocalBooks.settleRound(NAME, 100, 125, true);

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
      LocalBooks.settleRound(NAME, 0, 25, true);
      LocalBooks.setCursor(NAME, 100);
      LocalBooks.settleRound(NAME, 100, 125, true);
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
      LocalBooks.settleRound(NAME, 25, 50, true);

      expect(book().skipped).toEqual([[50, 100]]);
      expect(LocalBooks.getGaps(book())).toEqual([]);
      expect(LocalBooks.getDoneWordCount(book())).toBe(75);
    });
  });

  /**
   * WORKORDER 进度模型 v3 (user 2026-08-14): going over a stretch again is a
   * record of how it went, never a change to how much of the book has been
   * read. Everything here is really one assertion in different clothes —
   * *nothing a retype does may move the percentage*.
   */
  describe("retyping a stretch already read", () => {
    /** four rounds of 25, so the reader stands inside white text at 75 */
    beforeEach(() => {
      LocalBooks.setRound(NAME, { roundMode: "words", roundWords: 25 });
      LocalBooks.settleRound(NAME, 0, 100, true);
      LocalBooks.setCursor(NAME, 75);
    });

    function attempt(
      over: Partial<LocalBooks.Attempt> = {},
    ): LocalBooks.Attempt {
      return {
        id: LocalBooks.newAttemptId(),
        range: [75, 100],
        limit: { mode: "words", value: 25 },
        typedWords: 25,
        activeMs: 30_000,
        startedAt: Date.now(),
        ...over,
      };
    }

    it("knows the cursor is standing on text already read", () => {
      expect(LocalBooks.getRetypeRange(book())).toEqual([75, 100]);
    });

    it("treats unread text as ordinary progress, not a retype", () => {
      LocalBooks.setCursor(NAME, 100);
      expect(LocalBooks.getRetypeRange(book())).toBeUndefined();
    });

    // 「打完上次打得就停吧」 — asking for 50 words over a 25-word stretch types
    // 25 and settles there rather than running on into unread text
    it("stops a longer round at the end of what was read before", () => {
      LocalBooks.setRound(NAME, { roundMode: "words", roundWords: 50 });
      expect(LocalBooks.getRetypeRange(book())).toEqual([75, 100]);
    });

    it("gives a time round the whole run, and lets the clock stop it", () => {
      LocalBooks.setRound(NAME, { roundMode: "time", roundSeconds: 15 });
      LocalBooks.setCursor(NAME, 10);
      expect(LocalBooks.getRetypeRange(book())).toEqual([10, 100]);
    });

    it("leaves the reading alone however many times it is typed", () => {
      for (let pass = 0; pass < 3; pass++) {
        LocalBooks.saveAttempt(NAME, attempt({ startedAt: 1000 + pass }));
      }

      expect(book().done).toEqual([[0, 100]]);
      expect(LocalBooks.getProgressPercentage(book())).toBe(50);
      expect(LocalBooks.getGaps(book())).toEqual([]);
      expect(LocalBooks.getFrontier(book())).toBe(100);
    });

    it("numbers passes in the order they were typed", () => {
      const first = attempt({ startedAt: 3000 });
      const second = attempt({ startedAt: 1000 });
      LocalBooks.saveAttempt(NAME, first);
      LocalBooks.saveAttempt(NAME, second);

      expect(
        LocalBooks.getAttemptsOverlapping(book(), [75, 100]).map((a) => a.id),
      ).toEqual([second.id, first.id]);
    });

    it("shows a pass to a window that only overlaps it", () => {
      LocalBooks.saveAttempt(NAME, attempt());

      expect(LocalBooks.getAttemptsOverlapping(book(), [90, 120])).toHaveLength(
        1,
      );
      // touching end to end is not overlapping: [75,100) and [100,125) share
      // no word
      expect(LocalBooks.getAttemptsOverlapping(book(), [100, 125])).toEqual([]);
    });

    it("updates a pass in place when it is resumed, not clones it", () => {
      const paused = attempt({ typedWords: 10, activeMs: 9_000 });
      LocalBooks.saveAttempt(NAME, paused);
      LocalBooks.saveAttempt(NAME, {
        ...paused,
        typedWords: 25,
        activeMs: 21_000,
        finishedAt: Date.now(),
      });

      const all = LocalBooks.getAttemptsOverlapping(book(), [75, 100]);
      expect(all).toHaveLength(1);
      // set, not added to: saving twice must not double the time
      expect(all[0]?.activeMs).toBe(21_000);
      expect(LocalBooks.isAttemptFinished(all[0] as LocalBooks.Attempt)).toBe(
        true,
      );
    });

    it("hands a paused time round back the seconds it had left", () => {
      const paused = attempt({
        limit: { mode: "time", value: 15 },
        activeMs: 9_000,
      });

      expect(LocalBooks.getAttemptRemainingMs(paused)).toBe(6_000);
      // a word round has no clock to hand back
      expect(LocalBooks.getAttemptRemainingMs(attempt())).toBeUndefined();
    });

    it("separates passes to go back to from passes already done", () => {
      const open = attempt({ typedWords: 8, startedAt: 1000 });
      LocalBooks.saveAttempt(NAME, open);
      LocalBooks.saveAttempt(
        NAME,
        attempt({ startedAt: 2000, finishedAt: 3000 }),
      );

      expect(LocalBooks.getUnfinishedAttempts(book()).map((a) => a.id)).toEqual(
        [open.id],
      );
      expect(LocalBooks.getFinishedAttempts(book())).toHaveLength(1);
    });

    // 「点击 ✗,这个胶囊立刻消失,后台数据也随之消失」
    it("forgets a pass on ✗, and still not a word of the reading", () => {
      const doomed = attempt();
      LocalBooks.saveAttempt(NAME, doomed);

      expect(LocalBooks.deleteAttempt(NAME, doomed.id)).toBe(true);
      expect(book().attempts).toEqual([]);
      expect(LocalBooks.getDoneWordCount(book())).toBe(100);
      // and a second ✗ on the same one is not an error, just nothing
      expect(LocalBooks.deleteAttempt(NAME, doomed.id)).toBe(false);
    });

    it("keeps only the last ten passes over one stretch", () => {
      for (let pass = 0; pass < 14; pass++) {
        LocalBooks.saveAttempt(
          NAME,
          attempt({ startedAt: 1000 + pass, finishedAt: 2000 + pass }),
        );
      }

      const kept = LocalBooks.getAttemptsOverlapping(book(), [75, 100]);
      expect(kept).toHaveLength(LocalBooks.MAX_ATTEMPTS_PER_RANGE);
      // the oldest went, the newest stayed
      expect(kept[0]?.startedAt).toBe(1004);
      expect(kept.at(-1)?.startedAt).toBe(1013);
    });

    it("drops a souvenir before somewhere it can still go back to", () => {
      const unfinished = attempt({ startedAt: 1, typedWords: 3 });
      LocalBooks.saveAttempt(NAME, unfinished);
      for (let pass = 0; pass < 12; pass++) {
        LocalBooks.saveAttempt(
          NAME,
          attempt({ startedAt: 1000 + pass, finishedAt: 2000 + pass }),
        );
      }

      // oldest of the lot, but the only one with anywhere left to go
      expect(LocalBooks.getUnfinishedAttempts(book()).map((a) => a.id)).toEqual(
        [unfinished.id],
      );
    });

    it("never evicts the pass just written, however old it is", () => {
      const ancient = attempt({ startedAt: 1 });
      LocalBooks.saveAttempt(NAME, ancient);
      for (let pass = 0; pass < 9; pass++) {
        LocalBooks.saveAttempt(
          NAME,
          attempt({ startedAt: 1000 + pass, finishedAt: 2000 + pass }),
        );
      }

      // resuming the oldest pass and finishing it must not delete it for being
      // both finished and the oldest
      LocalBooks.saveAttempt(NAME, { ...ancient, finishedAt: 9999 });

      expect(
        LocalBooks.getAttemptsOverlapping(book(), [75, 100]).map((a) => a.id),
      ).toContain(ancient.id);
    });

    it("wipes the records on reset, along with everything else", () => {
      LocalBooks.saveAttempt(NAME, attempt());
      LocalBooks.resetProgress(NAME);

      expect(book().attempts).toEqual([]);
    });
  });

  /**
   * WORKORDER 进度模型 v3「模块(block)」. The user typed 9 words of a 15-second
   * round, stopped, and pressing a key put them back at the *start* of those 9
   * words instead of after them (reported 2026-08-14). `done` merges, so the
   * boundary of a round only exists if it is stored.
   */
  describe("where a resume lands", () => {
    it("goes back to the start of a round that was finished", () => {
      LocalBooks.settleRound(NAME, 0, 25, true);
      LocalBooks.settleRound(NAME, 25, 50, true);

      // the two merged into [0,50) in `done`, but the round is still its own
      // unit: land on it all in white, one → away from new text
      expect(LocalBooks.getLastFinishedStart(book())).toBe(25);
    });

    it("carries on from where a round was abandoned", () => {
      LocalBooks.settleRound(NAME, 0, 25, true);
      LocalBooks.settleRound(NAME, 25, 34, false);

      // not the start of the half-round — that is the reported bug
      expect(LocalBooks.getLastFinishedStart(book())).toBe(34);
    });

    it("never asks a book from before the boundaries to retype anything", () => {
      // no blocks recorded at all: the safe landing is the end of the reading
      LocalBooks.setCursor(NAME, 60);
      expect(LocalBooks.getLastFinishedStart(book())).toBe(0);
    });

    it("keeps each round separate even when the reading merges", () => {
      LocalBooks.settleRound(NAME, 0, 25, true);
      LocalBooks.settleRound(NAME, 25, 50, true);

      expect(book().done).toEqual([[0, 50]]);
      expect(book().blocks).toEqual([
        { range: [0, 25], complete: true },
        { range: [25, 50], complete: true },
      ]);
    });

    it("will not retype the tail of a round nobody finished", () => {
      LocalBooks.settleRound(NAME, 0, 9, false);
      LocalBooks.setCursor(NAME, 0);

      // those words are read, but half a round is not a unit to redo — typing
      // here is ordinary progress
      expect(LocalBooks.getRetypeRange(book())).toBeUndefined();
    });

    it("stops the boundary list growing without bound", () => {
      for (let i = 0; i < LocalBooks.MAX_BLOCKS + 5; i++) {
        LocalBooks.settleRound(NAME, 0, 1, true);
      }

      expect(book().blocks).toHaveLength(LocalBooks.MAX_BLOCKS);
      // and the reading is untouched by the eviction
      expect(LocalBooks.getDoneWordCount(book())).toBe(1);
    });
  });

  it("sends 'back to my progress' to the start of the last finished round", () => {
    LocalBooks.setRound(NAME, { roundMode: "words", roundWords: 25 });
    LocalBooks.settleRound(NAME, 0, 25, true);
    LocalBooks.settleRound(NAME, 25, 50, true);

    // the two rounds merged into [0,50), but the reader wants the last round
    // back — all white, one → away from new text
    expect(LocalBooks.getLastFinishedStart(book())).toBe(25);
    expect(LocalBooks.getFrontier(book())).toBe(50);
  });

  it("clamps anything past the end of the book", () => {
    LocalBooks.settleRound(NAME, 190, 500, true);

    expect(book().done).toEqual([[190, 200]]);
    expect(LocalBooks.getDoneWordCount(book())).toBe(10);
  });

  it("ignores a round in which nothing was typed", () => {
    LocalBooks.setCursor(NAME, 40);
    LocalBooks.settleRound(NAME, 40, 40, true);

    expect(book().done).toEqual([]);
    expect(book().progress).toBe(40);
  });

  it("wipes everything on reset, the one backwards move there is", () => {
    LocalBooks.settleRound(NAME, 0, 50, true);
    LocalBooks.dismissGap(NAME, [50, 60]);
    LocalBooks.resetProgress(NAME);

    expect(book().done).toEqual([]);
    expect(book().skipped).toEqual([]);
    expect(book().progress).toBe(0);
    expect(book().frontier).toBe(0);
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
    expect(migrated?.frontier).toBe(60);
    // nobody loses a percentage point to the upgrade
    expect(Books.getProgressPercentage(migrated as LocalBooks.Book)).toBe(30);
  });

  it("starts a book from before v3 with no retype records", async () => {
    window.localStorage.setItem(
      "customTextLong",
      JSON.stringify({ old: { text: TEXT, progress: 60, wordCount: 200 } }),
    );

    const Books = await import("../../src/ts/books/local-books");

    expect(Books.getBook("old")?.attempts).toEqual([]);
  });

  // a record is worth less than the book it hangs off: garbage in `attempts`
  // must cost the reader the records, never the text
  it("keeps the book when a stored attempt is malformed", async () => {
    window.localStorage.setItem(
      "customTextLong",
      JSON.stringify({
        old: {
          text: TEXT,
          progress: 60,
          wordCount: 200,
          attempts: [{ id: "x", range: "not a range" }],
        },
      }),
    );

    const Books = await import("../../src/ts/books/local-books");
    const migrated = Books.getBook("old");

    expect(migrated?.text).toBe(TEXT);
    expect(migrated?.done).toEqual([[0, 60]]);
    expect(migrated?.attempts).toEqual([]);
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
