import { createSignal } from "solid-js";

import { showModal } from "./modals";

/**
 * Which book the unfinished-parts dialog is showing. It is opened from two
 * places — the refresh button on the typing page, and the "+N more" on a book
 * card — and those are not always the same book.
 */
const [gapsModalBook, setGapsModalBook] = createSignal<string | null>(null);

export { gapsModalBook };

export function showBookGapsModal(name: string): void {
  setGapsModalBook(name);
  showModal("BookGaps");
}
