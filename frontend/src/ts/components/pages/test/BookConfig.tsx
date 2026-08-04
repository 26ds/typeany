import { For, JSXElement, Show } from "solid-js";

import {
  applyRound,
  getActiveBook,
  jumpToLastFinished,
  stepRound,
} from "../../../books/book-session";
import * as LocalBooks from "../../../books/local-books";
import { restartTestEvent } from "../../../events/test";
import { getResultVisible, getFocus } from "../../../states/test";
import { cn } from "../../../utils/cn";
import { Button } from "../../common/Button";
import { Fa } from "../../common/Fa";

/**
 * The config bar shown while reading a book. Deliberately the same shape as
 * the Random Mode bar (WORKORDER 回合设置: "跟 random 页那排长得一样"), but
 * every control here stays inside the book — nothing switches you back to
 * random words.
 */

const variables = cn(
  "[--card-gap:0.25em] [--font-size:0.5em] [--horizontal-padding:0.4em] [--vertical-padding:0.5rem]",
  "md:[--card-gap:1em] md:[--font-size:0.6em] md:[--horizontal-padding:0.45em] md:[--vertical-padding:0.75rem]",
  "lg:[--card-gap:1em] lg:[--font-size:0.75em] lg:[--horizontal-padding:0.5em] lg:[--vertical-padding:0.75rem]",
  "xl:[--card-gap:2em] xl:[--font-size:0.75em] xl:[--horizontal-padding:1em] xl:[--vertical-padding:0.75rem]",
);
const buttonClass = "px-(--horizontal-padding) py-(--vertical-padding)";
const cardClass =
  "card rounded-[1.125rem] border border-[rgba(190,235,215,0.12)] bg-[color-mix(in_srgb,var(--sub-alt-color)_62%,transparent)] px-(--horizontal-padding) backdrop-blur-xl";

function BCButton(props: {
  text: string;
  fa?: Parameters<typeof Fa>[0];
  active?: boolean;
  disabled?: boolean;
  balloon?: string;
  onClick: () => void;
}): JSXElement {
  return (
    <Button
      variant="text"
      class={buttonClass}
      fa={
        props.fa === undefined ? undefined : { ...props.fa, fixedWidth: true }
      }
      text={props.text}
      active={props.active}
      balloon={
        props.balloon === undefined ? undefined : { text: props.balloon }
      }
      onClick={props.onClick}
      disabled={getFocus() || getResultVisible() || props.disabled}
    />
  );
}

function restart(): void {
  restartTestEvent.dispatch({ isQuickRestart: false });
}

export function BookConfig(): JSXElement {
  const book = (): LocalBooks.Book | undefined => getActiveBook();

  const setRound = (round: Parameters<typeof LocalBooks.setRound>[1]): void => {
    const current = book();
    if (current === undefined) return;

    LocalBooks.setRound(current.name, round);
    const updated = LocalBooks.getBook(current.name);
    if (updated !== undefined) applyRound(updated);
    restart();
  };

  /**
   * Shown whenever the reader is parked somewhere other than the round they
   * last finished — however they got there, a gap pill or the arrows
   * (WORKORDER 进度模型 v2「回到进度」).
   */
  const isAwayFromProgress = (): boolean => {
    const current = book();
    if (current === undefined) return false;
    return (
      LocalBooks.getFrontier(current) > 0 &&
      current.progress !== LocalBooks.getLastFinishedStart(current)
    );
  };

  const atStart = (): boolean => (book()?.progress ?? 0) <= 0;
  const atEnd = (): boolean => {
    const current = book();
    return current === undefined || current.progress >= current.wordCount - 1;
  };

  return (
    <Show when={book() !== undefined}>
      <div
        class={cn(
          variables,
          // grid-flow-col rather than a fixed column count: the "back to my
          // progress" card comes and goes
          "group relative mb-8 hidden w-max grid-flow-col items-center justify-center gap-(--card-gap) place-self-center [font-size:var(--font-size)] md:grid",
          "mx-auto transition-opacity duration-125",
          getFocus() || getResultVisible()
            ? "pointer-events-none opacity-0"
            : "",
        )}
        data-ui-element="bookConfig"
      >
        {/* punctuation / numbers: shown so the bar matches Random Mode, but in
            a book they mean "skip these characters", which needs the character
            classifier from M3 — see WORKORDER 字符三分类 */}
        <div class={cardClass}>
          <BCButton
            text="punctuation"
            fa={{ icon: "fa-at" }}
            disabled
            balloon="coming soon"
            onClick={() => undefined}
          />
          <BCButton
            text="numbers"
            fa={{ icon: "fa-hashtag" }}
            disabled
            balloon="coming soon"
            onClick={() => undefined}
          />
        </div>

        <div class={cardClass}>
          <BCButton
            text="words"
            fa={{ icon: "fa-font" }}
            active={book()?.roundMode === "words"}
            onClick={() => setRound({ roundMode: "words" })}
          />
          <BCButton
            text="time"
            fa={{ icon: "fa-clock" }}
            active={book()?.roundMode === "time"}
            onClick={() => setRound({ roundMode: "time" })}
          />
        </div>

        <div class={cardClass}>
          <Show
            when={book()?.roundMode === "words"}
            fallback={
              <For each={LocalBooks.ROUND_TIME_OPTIONS}>
                {(seconds) => (
                  <BCButton
                    text={`${seconds}`}
                    active={book()?.roundSeconds === seconds}
                    onClick={() => setRound({ roundSeconds: seconds })}
                  />
                )}
              </For>
            }
          >
            <For each={LocalBooks.ROUND_WORD_OPTIONS}>
              {(words) => (
                <BCButton
                  text={`${words}`}
                  active={book()?.roundWords === words}
                  onClick={() => setRound({ roundWords: words })}
                />
              )}
            </For>
          </Show>
        </div>

        {/* one press back to where the reading actually stopped — the round
            that reached the frontier, all in white, one → from new text */}
        <Show when={isAwayFromProgress()}>
          <div class={cardClass}>
            <BCButton
              text="back to my progress"
              fa={{ icon: "fa-forward" }}
              balloon="jump to the last round you finished"
              onClick={() => {
                jumpToLastFinished();
                restart();
              }}
            />
          </div>
        </Show>
      </div>

      {/* prev / next block — WORKORDER 书籍打字页「左右两侧箭头」 */}
      <div
        class={cn(
          "pointer-events-none fixed inset-y-0 right-0 left-0 z-1 hidden items-center justify-between px-4 md:flex",
          getFocus() || getResultVisible() ? "opacity-0" : "",
        )}
      >
        <Button
          class="pointer-events-auto px-3 py-6 text-sub"
          variant="text"
          fa={{ icon: "fa-angle-left", size: 1.5 }}
          balloon={{ text: "previous block" }}
          disabled={atStart()}
          onClick={() => {
            stepRound(-1);
            restart();
          }}
        />
        <Button
          class="pointer-events-auto px-3 py-6 text-sub"
          variant="text"
          fa={{ icon: "fa-angle-right", size: 1.5 }}
          balloon={{ text: "next block" }}
          disabled={atEnd()}
          onClick={() => {
            stepRound(1);
            restart();
          }}
        />
      </div>
    </Show>
  );
}
