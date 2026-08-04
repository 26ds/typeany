import { navigate } from "../controllers/route-controller";
import { restartTestEvent } from "../events/test";
import { getActivePage } from "../states/core";
import { showErrorNotification } from "../states/notifications";
import { startBookSession } from "./book-session";
import * as LocalBooks from "./local-books";

/**
 * Opening a book from anywhere that is not the typing page. Lives outside
 * `book-session` on purpose: `controllers/route-controller` imports that
 * module to close the session on the way out, so it cannot import back.
 */

/**
 * Opens a book on the typing page, at its cursor or at `at` if given — a gap
 * pill hands the start of the stretch it wants typed.
 */
export function openBook(name: string, at?: number): void {
  if (at !== undefined) LocalBooks.setCursor(name, at);

  const book = LocalBooks.getBook(name);
  if (book === undefined) {
    showErrorNotification(`Book "${name}" is no longer on this device`);
    return;
  }

  // before navigating: /read is the one route navigate() does not close the
  // session for, and the active page only flips to "test" after the page
  // transition finishes — too late to be a precondition
  startBookSession(book);

  void navigate("/read").then(() => {
    if (getActivePage() === "test") {
      restartTestEvent.dispatch({ isQuickRestart: false });
    }
  });
}
