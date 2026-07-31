import { JSXElement } from "solid-js";

import { Button } from "../common/Button";
import { Fa } from "../common/Fa";
import { Page } from "../common/Page";

// Placeholder shelf. Real upload/parsing lands with the book layer; accounts
// and cloud sync land with the backend (see WORKORDER 分期 M2/M4/M6).
export function BookshelfPage(): JSXElement {
  return (
    <Page id="bookshelf">
      <div class="flex h-full flex-col items-center justify-center gap-8 py-8">
        <div
          class="flex max-w-xl flex-col items-center gap-4 rounded-[1.75rem] border border-[rgba(190,235,215,0.14)] bg-[color-mix(in_srgb,var(--sub-alt-color)_82%,transparent)] px-10 py-10 text-center backdrop-blur-xl"
          style={{ "box-shadow": "0 20px 60px rgba(0, 0, 0, 0.38)" }}
        >
          <Fa icon="fa-book-open" size={2.5} class="text-main" />
          <h2 class="text-em-2xl text-text">Your bookshelf is coming</h2>
          <p class="text-sub">
            Uploading your own PDF, EPUB or TXT — with chapter detection and
            page-range practice — is still being built. Signing in to keep your
            books and progress in the cloud comes with it.
          </p>
          <p class="text-sub">
            Until then, Random Mode is fully playable as a guest and your
            results are kept on this device.
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
      </div>
    </Page>
  );
}
