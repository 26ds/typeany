import { createSignal } from "solid-js";

import { showModal } from "./modals";

/**
 * Which book the unfinished-parts dialog is showing — not necessarily the book
 * open on the typing page, since it is opened from a book card.
 */
const [gapsModalBook, setGapsModalBook] = createSignal<string | null>(null);

export { gapsModalBook };

export function showBookGapsModal(name: string): void {
  setGapsModalBook(name);
  showModal("BookGaps");
}
