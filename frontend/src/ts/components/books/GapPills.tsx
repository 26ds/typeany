import { For, JSXElement } from "solid-js";

import * as LocalBooks from "../../books/local-books";
import { Fa } from "../common/Fa";

/**
 * The unfinished stretches of a book, as clickable pills — WORKORDER
 * 进度模型 v2「缺口胶囊」. Shared by the book card and the backlog dialog so the
 * two can never drift apart on what a pill means.
 */

/**
 * What the ✗ actually does. The user asked for this sentence explicitly
 * (2026-08-04): dismissing is not the same as having read it, and nothing on
 * screen would otherwise say so.
 */
export const DISMISS_HINT =
  "Click a part to go and type it. Clicking ✗ only takes it off this list — those words stay unread and your percentage does not move.";

const pillClass =
  "flex items-center overflow-hidden rounded-full border border-[rgba(190,235,215,0.12)] bg-[color-mix(in_srgb,var(--sub-alt-color)_62%,transparent)] text-em-xs";

export function GapPills(props: {
  book: LocalBooks.Book;
  gaps: LocalBooks.Range[];
  onJump: (gap: LocalBooks.Range) => void;
  onDismiss: (gap: LocalBooks.Range) => void;
}): JSXElement {
  return (
    <div class="flex flex-wrap items-center gap-1.5">
      <For each={props.gaps}>
        {(gap) => (
          <span class={pillClass}>
            <button
              type="button"
              class="cursor-pointer py-1 pr-1.5 pl-2.5 text-sub transition-colors hover:text-text"
              title={`Type from word ${(gap[0] + 1).toLocaleString()} (${(gap[1] - gap[0]).toLocaleString()} words)`}
              onClick={() => props.onJump(gap)}
            >
              {LocalBooks.getRangePreview(props.book, gap)}…
            </button>
            <button
              type="button"
              class="cursor-pointer py-1 pr-2.5 pl-1.5 text-sub transition-colors hover:text-error"
              title="Stop reminding me — these words stay unread"
              onClick={() => props.onDismiss(gap)}
            >
              <Fa icon="fa-times" />
            </button>
          </span>
        )}
      </For>
    </div>
  );
}
