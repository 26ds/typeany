import { JSXElement, Show } from "solid-js";

import { getActivePage, getIsScreenshotting } from "../../../states/core";
import { getFocus } from "../../../states/test";
import { cn } from "../../../utils/cn";
import { Logo } from "./Logo";
import { Nav } from "./Nav";

export function Header(): JSXElement {
  // Landing shows its own oversized wordmark — a header logo would duplicate it.
  const isHidden = (): boolean => getActivePage() === "landing";

  return (
    <Show when={!isHidden()}>
      <header
        class={cn("flex place-items-center gap-2", {
          "opacity-0": getIsScreenshotting(),
        })}
        data-ui-element="header"
        data-focused={getFocus() ? "" : undefined}
      >
        <Logo />
        <Nav />
      </header>
    </Show>
  );
}
