import { Accessor, JSXElement, Show } from "solid-js";

import * as LocalBooks from "../../books/local-books";
import { openBook } from "../../books/open-book";
import { gapsModalBook } from "../../states/book-gaps";
import { hideModalAndClearChain } from "../../states/modals";
import { DISMISS_HINT, GapPills } from "../books/GapPills";
import { AnimatedModal } from "../common/AnimatedModal";
import { Button } from "../common/Button";

/**
 * The backlog of stretches started and never finished — WORKORDER 进度模型 v2
 * 「缺口胶囊」. Opened from the `+N more` on a book card, once there are more of
 * them than the card is willing to list.
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

              <Show when={current().done.length > 0}>
                <div class="flex flex-wrap gap-2">
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
                </div>
              </Show>
            </div>
          );
        }}
      </Show>
    </AnimatedModal>
  );
}
