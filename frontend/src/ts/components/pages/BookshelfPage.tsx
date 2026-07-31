import { createEffect, createSignal, For, JSXElement, Show } from "solid-js";

import * as LocalBooks from "../../books/local-books";
import { getActivePage } from "../../states/core";
import { formatAge } from "../../utils/date-and-time";
import { Button } from "../common/Button";
import { Fa } from "../common/Fa";
import { Page } from "../common/Page";

// Ink Aurora glass (design/README §4). Same tailwind-utilities-on-the-element
// approach as the landing CTAs — the `utilities` layer outranks
// `custom-styles`, see M1c-3 log.
const glassClass =
  "rounded-[1.125rem] border border-[rgba(190,235,215,0.12)] bg-[color-mix(in_srgb,var(--sub-alt-color)_62%,transparent)] backdrop-blur-xl";

// design/README §4 — landing/UI stack. Sora and the Plex family land in M5.
const sansFont = '"Sora", "Space Grotesk", system-ui, sans-serif';

const glassShadow = { "box-shadow": "0 20px 60px rgba(0, 0, 0, 0.38)" };

function BookCard(props: { book: LocalBooks.Book }): JSXElement {
  const percentage = (): number => LocalBooks.getProgressPercentage(props.book);

  return (
    <div
      class={`${glassClass} flex min-w-0 flex-col gap-4 px-6 py-5`}
      style={glassShadow}
    >
      <div class="flex items-start gap-3">
        <Fa icon="fa-book" class="mt-1 text-main" fixedWidth />
        <div class="min-w-0 flex-1">
          <div class="truncate text-em-lg text-text" title={props.book.name}>
            {props.book.name}
          </div>
          <div class="text-em-xs text-sub">
            {props.book.wordCount.toLocaleString()} words
          </div>
        </div>
      </div>

      <div class="flex flex-col gap-1.5">
        <div class="h-1.5 w-full overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--sub-color)_28%,transparent)]">
          <div
            class="h-full rounded-full bg-main transition-[width]"
            style={{ width: `${percentage()}%` }}
          ></div>
        </div>
        <div class="flex justify-between text-em-xs text-sub">
          <span>
            <Show when={props.book.progress > 0} fallback="Not started">
              {props.book.progress.toLocaleString()} /{" "}
              {props.book.wordCount.toLocaleString()} words
            </Show>
          </span>
          <span>{percentage()}%</span>
        </div>
      </div>

      <div class="text-em-xs text-sub">
        <Show
          when={props.book.lastOpenedAt > props.book.createdAt}
          fallback="Never opened"
        >
          Opened {formatAge(props.book.lastOpenedAt, "short")} ago
        </Show>
      </div>
    </div>
  );
}

function EmptyShelf(): JSXElement {
  return (
    <div
      class={`${glassClass} flex max-w-xl flex-col items-center gap-4 px-10 py-10 text-center`}
      style={glassShadow}
    >
      <Fa icon="fa-book-open" size={2.5} class="text-main" />
      <h2 class="text-em-2xl text-text">Your shelf is empty</h2>
      <p class="text-sub">
        Books you save are kept on this device, along with how far into each one
        you have typed.
      </p>
      <div class="flex flex-wrap justify-center gap-3 pt-2">
        <Button
          fa={{ icon: "fa-keyboard" }}
          text="Random Mode"
          router-link
          href="/test"
          class="px-6 py-3"
        />
        <Button
          variant="text"
          fa={{ icon: "fa-home" }}
          text="Back home"
          router-link
          href="/"
          class="px-6 py-3"
        />
      </div>
    </div>
  );
}

export function BookshelfPage(): JSXElement {
  const [books, setBooks] = createSignal<LocalBooks.Book[]>([]);

  // the component itself is created once at app start, so re-read the shelf
  // every time the page becomes the active one
  createEffect(() => {
    if (getActivePage() === "bookshelf") {
      setBooks(LocalBooks.listBooks());
    }
  });

  return (
    <Page id="bookshelf">
      <div
        class="flex h-full flex-col gap-8 py-8"
        style={{ "font-family": sansFont }}
      >
        <Show
          when={books().length > 0}
          fallback={
            <div class="flex h-full flex-col items-center justify-center">
              <EmptyShelf />
            </div>
          }
        >
          <div class="flex flex-wrap items-baseline justify-between gap-3">
            <h1 class="text-em-2xl text-text">Bookshelf</h1>
            <span class="text-sub">
              {books().length} {books().length === 1 ? "book" : "books"} on this
              device
            </span>
          </div>

          <div class="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <For each={books()}>{(book) => <BookCard book={book} />}</For>
          </div>
        </Show>
      </div>
    </Page>
  );
}
