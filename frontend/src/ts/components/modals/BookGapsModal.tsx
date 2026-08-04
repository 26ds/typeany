import { Accessor, JSXElement, Show } from "solid-js";

import { activeBookName } from "../../books/book-session";
import * as LocalBooks from "../../books/local-books";
import { openBook } from "../../books/open-book";
import { restartTestEvent } from "../../events/test";
import { gapsModalBook } from "../../states/book-gaps";
import { hideModalAndClearChain } from "../../states/modals";
import { DISMISS_HINT, GapPills } from "../books/GapPills";
import { AnimatedModal } from "../common/AnimatedModal";
import { Button } from "../common/Button";

/**
 * The backlog of stretches started and never finished — WORKORDER 进度模型 v2
 * 「缺口胶囊」. The refresh button on the typing page opens this instead of
 * starting yet another round once there are more than `MAX_GAP_PILLS` of them.
 */
export function BookGapsModal(): JSXElement {
  const book = (): LocalBooks.Book | undefined => {
    LocalBooks.shelfVersion();
    const name = gapsModalBook();
    return name === null ? undefined : LocalBooks.getBook(name);
  };

  const close = (): void => hideModalAndClearChain("BookGaps");

  const jumpTo = (name: string, at: number): void => {
    close();
    openBook(name, at);
  };

  return (
    <AnimatedModal id="BookGaps" title="Parts you have not finished">
      <Show
        when={book()}
        fallback={
          <div class="text-em-sm text-sub">That book is no longer here.</div>
        }
      >
        {(current: Accessor<LocalBooks.Book>) => {
          const gaps = (): LocalBooks.Range[] => LocalBooks.getGaps(current());

          return (
            <div class="grid max-w-[36rem] gap-4">
              <div class="text-em-sm text-sub">{DISMISS_HINT}</div>

              <Show
                when={gaps().length > 0}
                fallback={
                  <div class="text-em-sm text-sub">
                    Nothing left unfinished.
                  </div>
                }
              >
                <GapPills
                  book={current()}
                  gaps={gaps()}
                  onJump={(gap) => jumpTo(current().name, gap[0])}
                  onDismiss={(gap) =>
                    LocalBooks.dismissGap(current().name, gap)
                  }
                />
              </Show>

              <div class="flex flex-wrap gap-2">
                <Show when={LocalBooks.getFrontier(current()) > 0}>
                  <Button
                    fa={{ icon: "fa-forward" }}
                    text="back to my progress"
                    onClick={() =>
                      jumpTo(
                        current().name,
                        LocalBooks.getLastFinishedStart(current()),
                      )
                    }
                  />
                </Show>
                {/* the round on screen is this book's, so restarting it means
                    something — opened from a book card it does not */}
                <Show when={activeBookName() === current().name}>
                  <Button
                    fa={{ icon: "fa-redo" }}
                    text="restart this round anyway"
                    onClick={() => {
                      close();
                      restartTestEvent.dispatch({ isQuickRestart: false });
                    }}
                  />
                </Show>
              </div>
            </div>
          );
        }}
      </Show>
    </AnimatedModal>
  );
}
