import { JSXElement } from "solid-js";

import { getIsScreenshotting } from "../../../states/core";
import { showModal } from "../../../states/modals";
import { getFocus } from "../../../states/test";
import { cn } from "../../../utils/cn";
import { Button } from "../../common/Button";
import { Keytips } from "./Keytips";
import { ThemeIndicator } from "./ThemeIndicator";
import { VersionButton } from "./VersionButton";

export function Footer(): JSXElement {
  return (
    <footer
      class={cn("relative text-xs text-sub", {
        "opacity-0": getIsScreenshotting(),
      })}
    >
      <Keytips />

      <div
        class="-m-2 flex justify-between gap-8 transition-opacity"
        classList={{
          "opacity-0": getFocus(),
        }}
      >
        <div class="grid grid-cols-1 justify-items-start xs:grid-cols-2 sm:grid-cols-4 lg:flex">
          <Button
            variant="text"
            text="contact"
            fa={{
              icon: "fa-envelope",
              fixedWidth: true,
            }}
            onClick={() => showModal("Contact")}
          />
          <Button
            variant="text"
            text="terms"
            fa={{
              icon: "fa-file-contract",
              fixedWidth: true,
            }}
            href="/terms-of-service.html"
          />
          <Button
            href="/security-policy.html"
            variant="text"
            text="security"
            fa={{
              icon: "fa-shield-alt",
              fixedWidth: true,
            }}
          />
          <Button
            href="/privacy-policy.html"
            variant="text"
            text="privacy"
            fa={{
              icon: "fa-lock",
              fixedWidth: true,
            }}
          />
        </div>
        <div class="flex flex-col items-end text-right lg:flex-row">
          <ThemeIndicator />
          <VersionButton />
        </div>
      </div>
    </footer>
  );
}
