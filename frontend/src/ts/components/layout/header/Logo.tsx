import { JSXElement } from "solid-js";

import { restartTestEvent } from "../../../events/test";
import { getActivePage } from "../../../states/core";
import { getFocus } from "../../../states/test";
import { cn } from "../../../utils/cn";

export function Logo(): JSXElement {
  return (
    <a
      href={`${location.origin}/`}
      class="-m-2 flex h-6 w-max items-center gap-2 rounded-[0.8rem] p-2"
      aria-label="TypeAny Home"
      router-link
      style={{
        "box-sizing": "content-box",
        "font-family": '"Sora", "Space Grotesk", system-ui, sans-serif',
      }}
      data-ui-element="logo"
      onClick={() => {
        if (getActivePage() === "test") restartTestEvent.dispatch();
      }}
    >
      <h1
        class={cn(
          "text-[1.5rem] leading-none font-semibold tracking-tight text-text transition-colors duration-250",
          {
            "text-sub": getFocus(),
          },
        )}
        data-ui-element="logoText"
      >
        Type<span classList={{ "text-main": !getFocus() }}>Any</span>
      </h1>
    </a>
  );
}
