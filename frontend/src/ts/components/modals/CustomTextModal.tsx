import type { CustomTextMode } from "@monkeytype/schemas/util";

import { createForm } from "@tanstack/solid-form";
import { batch, createSignal, For, JSXElement, Show, untrack } from "solid-js";

import type { FaSolidIcon } from "../../types/font-awesome";

import { setConfig } from "../../config/setters";
import { Config } from "../../config/store";
import { navigate } from "../../controllers/route-controller";
import { restartTestEvent } from "../../events/test";
import {
  getCustomTextIndicator,
  setCustomTextIndicator,
} from "../../states/core";
import {
  hideModal,
  hideModalAndClearChain,
  showModal,
} from "../../states/modals";
import {
  showNoticeNotification,
  showErrorNotification,
} from "../../states/notifications";
import { getLoadedChallenge, setLoadedChallenge } from "../../states/test";
import * as CustomText from "../../test/custom-text";
import * as PractiseWords from "../../test/practise-words";
import { cn } from "../../utils/cn";
import { AnimatedModal } from "../common/AnimatedModal";
import { Button } from "../common/Button";
import { Fa } from "../common/Fa";
import { Separator } from "../common/Separator";
import { SubmitButton } from "../ui/form/SubmitButton";
import { TextareaField } from "../ui/form/TextareaField";
import { CustomGeneratorModal } from "./CustomGeneratorModal";
import { SaveCustomTextModal } from "./SaveCustomTextModal";

export type CustomTextIncomingData =
  | ({ set?: boolean; long?: boolean } & (
      | { text: string; splitText?: never }
      | { text?: never; splitText: string[] }
    ))
  | null;

type Mode = "simple" | CustomTextMode;

const modeOptions = [
  { value: "simple", label: "simple" },
  { value: "repeat", label: "repeat" },
  { value: "shuffle", label: "shuffle" },
  { value: "random", label: "random" },
];

export function CustomTextModal(): JSXElement {
  const [longTextWarning, setLongTextWarning] = createSignal(false);
  const [challengeWarning, setChallengeWarning] = createSignal(false);

  const [incomingChainedData, setIncomingChainedData] =
    createSignal<CustomTextIncomingData>(null);

  const [textToSave, setTextToSave] = createSignal<string[]>([]);

  // oxlint-disable-next-line no-unassigned-vars -- assigned via SolidJS ref
  let fileInputRef!: HTMLInputElement;
  // oxlint-disable-next-line no-unassigned-vars -- assigned via SolidJS ref
  let textareaRef: HTMLTextAreaElement | undefined;

  const form = createForm(() => ({
    defaultValues: {
      text: "",
      mode: "simple" as Mode,
      limitWord: "",
      limitTime: "",
    },
    onSubmit: ({ value }) => {
      if (value.text === "") {
        showNoticeNotification("Text cannot be empty");
        return;
      }

      const activeLimits = [value.limitWord, value.limitTime].filter(
        (l) => l !== "",
      );
      if (activeLimits.length > 1) {
        showNoticeNotification("You can only specify one limit", {
          durationMs: 5000,
        });
        return;
      }

      if (
        value.mode !== "simple" &&
        value.limitWord === "" &&
        value.limitTime === ""
      ) {
        showNoticeNotification("You need to specify a limit", {
          durationMs: 5000,
        });
        return;
      }

      if (value.limitWord === "0" || value.limitTime === "0") {
        showNoticeNotification(
          "Infinite test! Make sure to use Bail Out from the command line to save your result.",
          { durationMs: 7000 },
        );
      }

      const text = cleanUpText();
      if (text.length === 0) {
        showNoticeNotification("Text cannot be empty");
        return;
      }

      if (value.mode === "simple") {
        CustomText.setMode("repeat");
      } else {
        CustomText.setMode(value.mode);
      }

      // the pipe delimiter UI is gone (WORKORDER custom trim table) — always
      // normalise back to space so a shared link can't leave the modal stuck
      // in a mode it has no control for.
      CustomText.setPipeDelimiter(false);
      CustomText.setText(text);

      if (value.mode === "simple") {
        CustomText.setLimitMode("word");
        CustomText.setLimitValue(text.length);
      } else if (value.limitWord !== "") {
        CustomText.setLimitMode("word");
        CustomText.setLimitValue(parseInt(value.limitWord));
      } else if (value.limitTime !== "") {
        CustomText.setLimitMode("time");
        CustomText.setLimitValue(parseInt(value.limitTime));
      }

      if (getLoadedChallenge() !== null) {
        showNoticeNotification("Challenge cleared");
        setLoadedChallenge(null);
      }
      if (Config.mode !== "custom") {
        setConfig("mode", "custom");
      }
      PractiseWords.resetBefore();
      restartTestEvent.dispatch();
      hideModalAndClearChain("CustomText");
    },
  }));

  const formValues = form.useStore((s) => s.values);

  const isDisabled = () => longTextWarning() || challengeWarning();
  const isLimitDisabled = () => formValues().mode === "simple" || isDisabled();

  const cleanUpText = (): string[] => {
    let text = form.getFieldValue("text");
    if (text === "") return [];

    text = text.normalize();
    text = text.replace(/[\u2000-\u200A\u202F\u205F\u00A0]/g, " ");
    text = text.replace(/ +/gm, " ");
    text = text.replace(/( *(\r\n|\r|\n) *)/g, "\n ");

    return text.split(" ").filter((word) => word !== "");
  };

  const applyRemoveZeroWidth = () => {
    form.setFieldValue(
      "text",
      form.getFieldValue("text").replace(/[\u200B-\u200D\u2060\uFEFF]/g, ""),
    );
  };

  const applyReplaceNewlines = (mode: "space" | "periodSpace") => {
    let text = form.getFieldValue("text");
    if (mode === "periodSpace") {
      text = text.replace(/\n/gm, ". ");
      text = text.replace(/\.\. /gm, ". ");
      text = text.replace(/ +/gm, " ");
    } else {
      text = text.replace(/\n/gm, " ");
      text = text.replace(/ +/gm, " ");
    }
    form.setFieldValue("text", text);
  };

  const initState = () => {
    let mode: Mode = CustomText.getMode();
    if (
      mode === "repeat" &&
      CustomText.getLimitMode() !== "time" &&
      CustomText.getLimitValue() === CustomText.getText().length
    ) {
      mode = "simple";
    }

    let limitWord = "";
    let limitTime = "";

    if (mode !== "simple") {
      if (CustomText.getLimitMode() === "time") {
        limitTime = `${CustomText.getLimitValue()}`;
      } else {
        // "section" can only come from a shared link or practise words; the
        // modal has no pipe delimiter anymore, so show it as a word limit.
        limitWord = `${CustomText.getLimitValue()}`;
      }
    }

    const text = CustomText.getText().join(" ").replace(/^ +/gm, "");

    untrack(() => {
      batch(() => {
        form.setFieldValue("mode", mode);
        form.setFieldValue("limitWord", limitWord);
        form.setFieldValue("limitTime", limitTime);
        form.setFieldValue("text", text);
      });
    });

    setLongTextWarning(getCustomTextIndicator()?.isLong ?? false);
    setChallengeWarning(getLoadedChallenge() !== null);
  };

  const handleIncomingData = () => {
    const data = incomingChainedData();
    if (data === null) return;
    setIncomingChainedData(null);

    if (data.long !== true && getCustomTextIndicator()?.isLong) {
      setCustomTextIndicator(undefined);
      showNoticeNotification("Disabled long custom text progress tracking", {
        durationMs: 5000,
      });
      setLongTextWarning(false);
    }

    if (data.long) {
      setLongTextWarning(true);
    }

    const incomingText =
      data.splitText !== undefined ? data.splitText.join(" ") : data.text;

    const newText =
      (data.set ?? true)
        ? incomingText
        : `${form.getFieldValue("text")} ${incomingText}`;
    untrack(() => {
      batch(() => {
        form.setFieldValue("text", newText);
        form.setFieldValue("mode", "simple");
        form.setFieldValue("limitWord", `${cleanUpText().length}`);
        form.setFieldValue("limitTime", "");
      });
    });
  };

  const handleFileOpen = () => {
    const file = fileInputRef?.files?.[0];
    if (!file) return;

    if (file.type !== "text/plain") {
      showErrorNotification("File is not a text file", { durationMs: 5000 });
      return;
    }

    const reader = new FileReader();
    reader.readAsText(file, "UTF-8");
    reader.onload = (e) => {
      const content = e.target?.result as string;
      form.setFieldValue("text", content);
      fileInputRef.value = "";
    };
    reader.onerror = () => {
      showErrorNotification("Failed to read file", { durationMs: 5000 });
    };
  };

  const handleTextareaKeydown = (e: KeyboardEvent) => {
    if (e.key === "Tab") {
      e.preventDefault();
      const area = e.currentTarget as HTMLTextAreaElement;
      const start = area.selectionStart;
      const end = area.selectionEnd;
      area.value = `${area.value.substring(0, start)}\t${area.value.substring(end)}`;
      area.selectionStart = area.selectionEnd = start + 1;
      form.setFieldValue("text", area.value);
    }
  };

  const handleTextareaKeypress = (e: KeyboardEvent) => {
    if (isDisabled()) {
      e.preventDefault();
      return;
    }
    if (e.code === "Enter" && e.ctrlKey) {
      void form.handleSubmit();
    }
    if (getCustomTextIndicator()?.isLong) {
      setCustomTextIndicator(undefined);
      setLongTextWarning(false);
      showNoticeNotification("Disabled long custom text progress tracking", {
        durationMs: 5000,
      });
    }
  };

  const handleModeChange = (value: string) => {
    batch(() => {
      const previousMode = formValues().mode;

      form.setFieldValue("mode", value as Mode);
      if (value === "simple") {
        form.setFieldValue("limitWord", "");
        form.setFieldValue("limitTime", "");
      } else if (previousMode === "simple") {
        form.setFieldValue("limitTime", "");
        form.setFieldValue("limitWord", `${cleanUpText().length}`);
      }
    });
  };

  const beforeShow = (isChained: boolean) => {
    if (!isChained) {
      initState();
    } else {
      handleIncomingData();
    }
  };

  const afterShow = () => {
    if (!isDisabled()) {
      textareaRef?.focus();
    }
  };

  return (
    <>
      <AnimatedModal
        id="CustomText"
        modalClass="max-w-[1200px] lg:grid-cols-[auto_20rem] grid-cols-1 h-min"
        beforeShow={beforeShow}
        afterShow={afterShow}
      >
        <form
          class="contents"
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            void form.handleSubmit();
          }}
        >
          <Separator class="row-start-2 block lg:hidden" />
          <div class="row-start-3 grid gap-4 lg:row-start-1">
            {/* Top buttons row 1 */}
            <div class="grid grid-cols-2 gap-4">
              <Button
                variant="button"
                fa={{ icon: "fa-save" }}
                text="save"
                onClick={() => {
                  setTextToSave(cleanUpText());
                  showModal("SaveCustomText");
                }}
              />
              {/* M2c: saved texts is the bookshelf now (WORKORDER 裁剪表) */}
              <Button
                variant="button"
                fa={{ icon: "fa-book-open" }}
                text="bookshelf"
                onClick={() => {
                  hideModal("CustomText");
                  void navigate("/bookshelf");
                }}
              />
            </div>

            {/* Textarea */}
            <div class="relative lg:col-start-1">
              <Show when={longTextWarning()}>
                <div
                  class="absolute inset-0 z-10 grid cursor-pointer place-items-center rounded bg-sub-alt text-center"
                  onClick={() => setLongTextWarning(false)}
                >
                  <div>
                    <p class="text-em-xl">
                      A long custom text is currently loaded.
                      <br />
                      Editing the text will disable progress tracking.
                    </p>
                    <p class="mt-4 text-em-xs text-sub">
                      Click anywhere to start editing the text.
                    </p>
                  </div>
                </div>
              </Show>
              <Show when={challengeWarning()}>
                <div
                  class="absolute inset-0 z-10 grid cursor-pointer place-items-center rounded bg-sub-alt text-center"
                  onClick={() => setChallengeWarning(false)}
                >
                  <div>
                    <p class="text-em-xl">
                      A challenge is currently loaded.
                      <br />
                      Editing the settings will clear the challenge.
                    </p>
                    <p class="mt-4 text-em-xs text-sub">
                      Click anywhere to edit.
                    </p>
                  </div>
                </div>
              </Show>
              <form.Field name="text">
                {(field) => (
                  <TextareaField
                    field={field}
                    ref={textareaRef}
                    placeholder="type or paste your custom text"
                    class="min-h-182.5 self-start overflow-x-hidden overflow-y-scroll p-4 text-base font-(--font) text-text"
                    onKeyDown={handleTextareaKeydown}
                    onKeyPress={handleTextareaKeypress}
                  />
                )}
              </form.Field>
            </div>
            <SubmitButton
              form={form}
              skipUnchangedCheck
              variant="button"
              text="ok"
              class="lg:col-start-1"
              disabled={isDisabled()}
            />
          </div>

          {/* Settings sidebar — on large screens spans all rows in column 2 */}
          <div
            class={cn(
              "grid h-min gap-4 text-xs",
              isDisabled() && "pointer-events-none opacity-50 select-none",
            )}
          >
            <SettingsGroup
              title="Mode"
              icon="fa-cog"
              sub="Change the way words are generated."
            >
              <div class="flex w-full gap-2">
                <For each={modeOptions}>
                  {(opt) => (
                    <Button
                      variant="button"
                      text={opt.label}
                      class="flex-1"
                      active={formValues().mode === opt.value}
                      onClick={() => handleModeChange(opt.value)}
                    />
                  )}
                </For>
              </div>
            </SettingsGroup>

            <SettingsGroup
              title="Limit"
              icon="fa-step-forward"
              sub="Control how many words to generate or for how long you want to type."
            >
              <div class="flex w-full items-center gap-4">
                <form.Field name="limitWord">
                  {(field) => (
                    <input
                      type="number"
                      class="w-full"
                      min="0"
                      placeholder="words"
                      value={field().state.value}
                      disabled={isLimitDisabled()}
                      onInput={(e) => {
                        field().handleChange(e.currentTarget.value);
                        form.setFieldValue("limitTime", "");
                      }}
                    />
                  )}
                </form.Field>
                <span class="text-sub">or</span>
                <form.Field name="limitTime">
                  {(field) => (
                    <input
                      type="number"
                      class="w-full"
                      min="0"
                      placeholder="time"
                      value={field().state.value}
                      disabled={isLimitDisabled()}
                      onInput={(e) => {
                        field().handleChange(e.currentTarget.value);
                        form.setFieldValue("limitWord", "");
                      }}
                    />
                  )}
                </form.Field>
              </div>
            </SettingsGroup>
            <Separator />
            <div class="grid gap-2">
              <input
                ref={fileInputRef}
                type="file"
                class="hidden"
                accept=".txt"
                onChange={handleFileOpen}
              />
              <Button
                variant="button"
                fa={{ icon: "fa-file-import" }}
                text="open file"
                onClick={() => fileInputRef.click()}
              />
              <Button
                variant="button"
                fa={{ icon: "fa-cogs" }}
                text="custom generator"
                onClick={() => showModal("CustomGenerator")}
              />
            </div>
            {/* <Separator /> */}
            <SettingsGroup
              title="Remove zero-width characters"
              icon="fa-text-width"
              sub="Fully remove zero-width characters."
            >
              <Button
                variant="button"
                text="apply"
                class="w-full"
                onClick={applyRemoveZeroWidth}
              />
            </SettingsGroup>

            <SettingsGroup
              title="Replace new lines with spaces"
              icon="fa-level-down-alt"
              iconClass="fa-rotate-90"
              sub="Replace all new line characters with spaces. Can automatically add periods to the end of lines if you wish."
            >
              <div class="flex w-full gap-2">
                <Button
                  variant="button"
                  text="space"
                  class="flex-1"
                  onClick={() => applyReplaceNewlines("space")}
                />
                <Button
                  variant="button"
                  text="period + space"
                  class="flex-1"
                  onClick={() => applyReplaceNewlines("periodSpace")}
                />
              </div>
            </SettingsGroup>
          </div>
        </form>
      </AnimatedModal>
      <SaveCustomTextModal textToSave={textToSave} />
      <CustomGeneratorModal setChainedData={setIncomingChainedData} />
    </>
  );
}

function SettingsGroup(props: {
  title: string;
  icon: FaSolidIcon;
  iconClass?: string;
  sub: string;
  children: JSXElement;
}): JSXElement {
  return (
    <div class="grid w-full">
      <div class="flex items-center gap-2 text-sub lowercase">
        <Fa icon={props.icon} fixedWidth class={props.iconClass} />
        {props.title}
      </div>
      <div class="mt-1 mb-2 text-text">{props.sub}</div>
      {props.children}
    </div>
  );
}
