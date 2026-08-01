import { createForm } from "@tanstack/solid-form";
import { Accessor, JSXElement } from "solid-js";
import { z } from "zod";

import { setCustomTextIndicator } from "../../states/core";
import { hideModal } from "../../states/modals";
import {
  showNoticeNotification,
  showErrorNotification,
  showSuccessNotification,
} from "../../states/notifications";
import * as CustomText from "../../test/custom-text";
import { AnimatedModal } from "../common/AnimatedModal";
import { InputField } from "../ui/form/InputField";
import { SubmitButton } from "../ui/form/SubmitButton";
import { fromSchema } from "../ui/form/utils";

const nameSchema = z
  .string()
  .min(1, "Name is required")
  .max(32, "Name must be 32 characters or less")
  .regex(
    /^[\w\s-]+$/,
    "Name can only contain letters, numbers, spaces, underscores and hyphens",
  );

export function SaveCustomTextModal(props: {
  textToSave: Accessor<string[]>;
}): JSXElement {
  const form = createForm(() => ({
    defaultValues: {
      name: "",
    },
    // D1 (WORKORDER 已定决策): everything saved is a book with a progress
    // pointer, so the old "Long text (book mode)" checkbox is gone and `long`
    // is always true.
    onSubmit: ({ value }) => {
      const text = props.textToSave();
      if (text.length === 0) {
        showNoticeNotification("Custom text can't be empty");
        return;
      }

      const saved = CustomText.setCustomText(value.name, text, true);
      if (saved) {
        setCustomTextIndicator({ name: value.name, isLong: true });
        showSuccessNotification(`Saved to your bookshelf as "${value.name}"`);
        hideModal("SaveCustomText");
      } else {
        showErrorNotification("Error saving custom text");
      }
    },
  }));

  return (
    <AnimatedModal
      id="SaveCustomText"
      title="Save to bookshelf"
      modalClass="max-w-sm"
      focusFirstInput={true}
      beforeShow={() => {
        form.reset();
      }}
    >
      <form
        class="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          void form.handleSubmit();
        }}
      >
        <form.Field
          name="name"
          validators={{
            onChange: ({ value }) => {
              const schemaErrors = fromSchema(nameSchema)({ value });
              if (schemaErrors !== undefined) {
                return schemaErrors;
              }

              if (CustomText.getCustomTextNames(true).includes(value)) {
                return "Duplicate name";
              }

              return undefined;
            },
          }}
          children={(field) => <InputField field={field} placeholder="name" />}
        />
        <div class="text-xs text-sub">
          The book keeps your place: press shift + enter or bail out to save
          progress, then continue from the bookshelf. Editing this text here
          stops the tracking.
        </div>
        <SubmitButton form={form} variant="button" text="save" />
      </form>
    </AnimatedModal>
  );
}
