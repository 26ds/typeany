import { createEffect, createSignal, For, JSXElement, Show } from "solid-js";
import { z } from "zod";

import {
  cleanExtractedText,
  extractText,
  ExtractTextError,
  UPLOAD_ACCEPT,
} from "../../books/extract-text";
import * as LocalBooks from "../../books/local-books";
import { setConfig } from "../../config/setters";
import { navigate } from "../../controllers/route-controller";
import { restartTestEvent } from "../../events/test";
import { getActivePage, setCustomTextIndicator } from "../../states/core";
import {
  showErrorNotification,
  showSuccessNotification,
} from "../../states/notifications";
import { showSimpleModal } from "../../states/simple-modal";
import * as CustomText from "../../test/custom-text";
import { formatAge } from "../../utils/date-and-time";
import { download } from "../../utils/misc";
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

const nameSchema = z
  .string()
  .min(1, "Name is required")
  .max(64, "Name must be 64 characters or less");

/** loads the book into the typing page and starts a round at its pointer */
function openBook(name: string): void {
  const book = LocalBooks.getBook(name);
  if (book === undefined) {
    showErrorNotification(`Book "${name}" is no longer on this device`);
    return;
  }

  LocalBooks.touchBook(name);

  const words = LocalBooks.splitWords(book.text);
  CustomText.setMode("repeat");
  CustomText.setPipeDelimiter(false);
  CustomText.setText(words.slice(book.progress));
  CustomText.setLimitMode("word");
  CustomText.setLimitValue(words.length - book.progress);
  setCustomTextIndicator({ name, isLong: true });
  setConfig("mode", "custom");

  void navigate("/test").then(() => {
    // navigate() silently no-ops while the app is busy, so only start a round
    // if we actually landed on the typing page
    if (getActivePage() === "test") {
      restartTestEvent.dispatch({ isQuickRestart: false });
    }
  });
}

function BookCard(props: {
  book: LocalBooks.Book;
  onChanged: () => void;
}): JSXElement {
  const percentage = (): number => LocalBooks.getProgressPercentage(props.book);
  const isStarted = (): boolean => props.book.progress > 0;

  const handleReset = (): void => {
    showSimpleModal({
      title: "Reset progress",
      text: `Start "${props.book.name}" again from the first word?`,
      buttonText: "reset",
      execFn: async () => {
        LocalBooks.resetProgress(props.book.name);
        props.onChanged();
        return { status: "success", message: "Progress reset" };
      },
    });
  };

  const handleRename = (): void => {
    const oldName = props.book.name;
    showSimpleModal({
      title: "Rename book",
      buttonText: "rename",
      focusFirstInput: "focusAndSelect",
      schema: z.object({ name: nameSchema }),
      inputs: { name: { type: "text", initVal: oldName, placeholder: "name" } },
      execFn: async ({ name }) => {
        if (name === oldName) {
          return { status: "success", message: "Name unchanged" };
        }
        if (!LocalBooks.renameBook(oldName, name)) {
          return {
            status: "error",
            message: `Could not rename — "${name}" is already on the shelf`,
          };
        }
        props.onChanged();
        return { status: "success", message: "Book renamed" };
      },
    });
  };

  const handleDownload = (): void => {
    try {
      const data = new Blob([props.book.text], { type: "text/plain" });
      download({ filename: `${props.book.name}.txt`, data });
      showSuccessNotification("Book downloaded");
    } catch (e) {
      showErrorNotification(`Failed to download book: ${e}`);
    }
  };

  const handleDelete = (): void => {
    showSimpleModal({
      title: "Delete book",
      text: `Delete "${props.book.name}" and its progress? This cannot be undone.`,
      buttonText: "delete",
      execFn: async () => {
        LocalBooks.deleteBook(props.book.name);
        setCustomTextIndicator(undefined);
        props.onChanged();
        return { status: "success", message: "Book deleted" };
      },
    });
  };

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
            <Show when={isStarted()} fallback="Not started">
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

      <div class="mt-auto flex items-center gap-2 pt-1">
        <Button
          fa={{ icon: isStarted() ? "fa-play" : "fa-keyboard" }}
          text={isStarted() ? "continue" : "start"}
          class="flex-1"
          onClick={() => openBook(props.book.name)}
        />
        <Button
          fa={{ icon: "fa-undo", fixedWidth: true }}
          balloon={{ text: "reset progress" }}
          disabled={!isStarted()}
          onClick={handleReset}
        />
        <Button
          fa={{ icon: "fa-pen", fixedWidth: true }}
          balloon={{ text: "rename" }}
          onClick={handleRename}
        />
        <Button
          fa={{ icon: "fa-file-download", fixedWidth: true }}
          balloon={{ text: "download" }}
          onClick={handleDownload}
        />
        <Button
          fa={{ icon: "fa-trash", fixedWidth: true }}
          balloon={{ text: "delete" }}
          onClick={handleDelete}
        />
      </div>
    </div>
  );
}

/** the dashed "next book" slot — upload lives in the grid, not in a toolbar */
function AddBookCard(props: { onAdded: () => void }): JSXElement {
  const [isBusy, setIsBusy] = createSignal(false);
  const [isDragOver, setIsDragOver] = createSignal(false);
  let fileInput: HTMLInputElement | undefined;

  const addBook = (name: string, text: string): boolean => {
    if (LocalBooks.getBook(name) !== undefined) {
      showErrorNotification(
        `"${name}" is already on your shelf — rename or delete it first`,
      );
      return false;
    }
    if (!LocalBooks.addBook(name, text)) {
      // addBook already surfaced the storage error
      return false;
    }
    props.onAdded();
    return true;
  };

  const handleFile = async (file: File): Promise<void> => {
    if (isBusy()) return;
    setIsBusy(true);
    try {
      const { text, title } = await extractText(file);
      // a duplicate name is the user's to resolve, so ask rather than
      // silently suffixing it
      const name = LocalBooks.getBook(title) === undefined ? title : "";
      if (name !== "" && addBook(name, text)) {
        showSuccessNotification(
          `Added "${name}" — ${LocalBooks.splitWords(text).length.toLocaleString()} words`,
        );
        return;
      }
      showNameConflictModal(title, text);
    } catch (e) {
      // say which failure it was; never a bare "import failed"
      showErrorNotification(
        e instanceof ExtractTextError
          ? e.message
          : `Could not read ${file.name}: ${(e as Error).message}`,
        { durationMs: 8000, important: true },
      );
    } finally {
      setIsBusy(false);
    }
  };

  const showNameConflictModal = (title: string, text: string): void => {
    showSimpleModal({
      title: "Name this book",
      text: `"${title}" is already on your shelf. Pick another name.`,
      buttonText: "add",
      focusFirstInput: "focusAndSelect",
      schema: z.object({ name: nameSchema }),
      inputs: {
        name: { type: "text", initVal: `${title} (2)`, placeholder: "name" },
      },
      execFn: async ({ name }) => {
        if (LocalBooks.getBook(name) !== undefined) {
          return { status: "error", message: `"${name}" is also taken` };
        }
        return addBook(name, text)
          ? { status: "success", message: `Added "${name}"` }
          : { status: "error", message: "Could not save the book" };
      },
    });
  };

  const handlePaste = (): void => {
    showSimpleModal({
      title: "Paste a book",
      buttonText: "add",
      focusFirstInput: true,
      schema: z.object({
        name: nameSchema,
        text: z.string().min(1, "Text is required"),
      }),
      inputs: {
        name: { type: "text", placeholder: "name" },
        text: { type: "textarea", placeholder: "paste your text here" },
      },
      execFn: async ({ name, text }) => {
        const cleaned = cleanExtractedText(text);
        if (cleaned === "") {
          return { status: "error", message: "That text has no words in it" };
        }
        if (LocalBooks.getBook(name) !== undefined) {
          return {
            status: "error",
            message: `"${name}" is already on your shelf`,
          };
        }
        return addBook(name, cleaned)
          ? {
              status: "success",
              message: `Added "${name}" — ${LocalBooks.splitWords(cleaned).length.toLocaleString()} words`,
            }
          : { status: "error", message: "Could not save the book" };
      },
    });
  };

  return (
    <div
      class={`flex min-h-[13rem] min-w-0 flex-col items-center justify-center gap-3 rounded-[1.125rem] border-2 border-dashed px-6 py-5 text-center transition-colors ${
        isDragOver()
          ? "border-(--main-color) bg-[color-mix(in_srgb,var(--main-color)_10%,transparent)]"
          : "border-[rgba(190,235,215,0.22)]"
      }`}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragOver(true);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragOver(false);
        const file = e.dataTransfer?.files[0];
        if (file !== undefined) void handleFile(file);
      }}
    >
      <input
        ref={(el) => {
          fileInput = el;
        }}
        type="file"
        accept={UPLOAD_ACCEPT}
        class="hidden"
        onChange={(e) => {
          const file = e.currentTarget.files?.[0];
          e.currentTarget.value = "";
          if (file !== undefined) void handleFile(file);
        }}
      />

      <Show
        when={!isBusy()}
        fallback={
          <>
            <Fa icon="fa-circle-notch" size={1.75} spin class="text-main" />
            <div class="text-sub">Reading your file…</div>
          </>
        }
      >
        <Fa icon="fa-plus" size={1.75} class="text-sub" />
        <div class="text-em-lg text-text">Add a book</div>
        <div class="text-em-xs text-sub">
          Drop a file here, or pick one — PDF, EPUB, DOCX, MD, TXT
        </div>
        <div class="flex flex-wrap justify-center gap-2 pt-1">
          <Button
            fa={{ icon: "fa-file-upload" }}
            text="choose file"
            onClick={() => fileInput?.click()}
          />
          <Button
            variant="text"
            fa={{ icon: "fa-paste" }}
            text="paste text"
            onClick={handlePaste}
          />
        </div>
      </Show>
    </div>
  );
}

export function BookshelfPage(): JSXElement {
  const [books, setBooks] = createSignal<LocalBooks.Book[]>([]);

  const refresh = (): void => {
    setBooks(LocalBooks.listBooks());
  };

  // the component itself is created once at app start, so re-read the shelf
  // every time the page becomes the active one
  createEffect(() => {
    if (getActivePage() === "bookshelf") {
      refresh();
    }
  });

  return (
    <Page id="bookshelf">
      <div
        class="flex h-full flex-col gap-8 py-8"
        style={{ "font-family": sansFont }}
      >
        <div class="flex flex-wrap items-baseline justify-between gap-3">
          <h1 class="text-em-2xl text-text">Bookshelf</h1>
          <Show
            when={books().length > 0}
            fallback={
              <span class="text-sub">
                Your books stay on this device — nothing is uploaded anywhere
              </span>
            }
          >
            <span class="text-sub">
              {books().length} {books().length === 1 ? "book" : "books"} on this
              device
            </span>
          </Show>
        </div>

        <div class="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <For each={books()}>
            {(book) => <BookCard book={book} onChanged={refresh} />}
          </For>
          <AddBookCard onAdded={refresh} />
        </div>
      </div>
    </Page>
  );
}
