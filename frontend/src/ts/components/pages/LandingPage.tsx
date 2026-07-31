import { JSXElement } from "solid-js";

import { Fa } from "../common/Fa";
import { Page } from "../common/Page";

// Ink Aurora glass CTA (design/README §4 glass params, §8 button motion).
// Written as tailwind utilities on the element (not SCSS) because the
// `utilities` layer outranks `custom-styles` — see M1c-3 log.
const ctaClass =
  "flex flex-1 cursor-pointer flex-col gap-2 rounded-[1.125rem] border border-[rgba(190,235,215,0.12)] bg-[color-mix(in_srgb,var(--sub-alt-color)_62%,transparent)] px-7 py-6 text-left no-underline backdrop-blur-xl transition-[filter,transform,border-color,box-shadow] duration-150 ease-out hover:border-[rgba(190,235,215,0.24)] hover:brightness-110 motion-safe:hover:-translate-y-px motion-safe:active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--main-color)";

const sansFont = '"Sora", "Space Grotesk", system-ui, sans-serif';

export function LandingPage(): JSXElement {
  return (
    <Page id="landing">
      <div
        class="flex h-full flex-col items-center justify-center gap-14 py-8"
        style={{ "font-family": sansFont }}
      >
        <div class="flex flex-col items-center gap-4 text-center">
          <h1 class="text-[clamp(3.25rem,11vw,6rem)] leading-none font-semibold tracking-tight text-text">
            Type<span class="text-main">Any</span>
          </h1>
          <p class="max-w-xl text-em-lg text-sub">
            Type through your own books — or just warm up on random words.
          </p>
        </div>

        <div class="flex w-full max-w-3xl flex-col gap-5 sm:flex-row">
          <a
            href="/bookshelf"
            router-link
            class={ctaClass}
            data-ui-element="landingUpload"
            style={{ "box-shadow": "0 20px 60px rgba(0, 0, 0, 0.38)" }}
          >
            <span class="flex items-center gap-3 text-em-xl text-text">
              <Fa icon="fa-book-open" class="text-main" fixedWidth />
              Upload &amp; Type
            </span>
            <span class="text-sub">
              Bring a PDF, EPUB or TXT and practise on its chapters.
            </span>
          </a>

          <a
            href="/test"
            router-link
            class={ctaClass}
            data-ui-element="landingRandom"
            style={{ "box-shadow": "0 20px 60px rgba(0, 0, 0, 0.38)" }}
          >
            <span class="flex items-center gap-3 text-em-xl text-text">
              <Fa icon="fa-keyboard" class="text-main" fixedWidth />
              Random Mode
            </span>
            <span class="text-sub">
              Classic timed and word-count tests. No account needed.
            </span>
          </a>
        </div>
      </div>
    </Page>
  );
}
