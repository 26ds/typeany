import { CustomTextLimitMode, CustomTextMode } from "@monkeytype/schemas/util";
import { LocalStorageWithSchema } from "../utils/local-storage-with-schema";
import { z } from "zod";
import {
  CustomTextSettings,
  CustomTextSettingsSchema,
} from "@monkeytype/schemas/results";
import * as LocalBooks from "../books/local-books";

const CustomTextObjectSchema = z.record(z.string(), z.string());
type CustomTextObject = z.infer<typeof CustomTextObjectSchema>;

const customTextLS = new LocalStorageWithSchema({
  key: "customText",
  schema: CustomTextObjectSchema,
  fallback: {},
});

type CustomTextLimit = z.infer<typeof CustomTextSettingsSchema>["limit"];

const defaultCustomTextSettings: CustomTextSettings = {
  text: ["The", "quick", "brown", "fox", "jumps", "over", "the", "lazy", "dog"],
  mode: "repeat",
  limit: { value: 9, mode: "word" },
  pipeDelimiter: false,
};

const customTextSettings = new LocalStorageWithSchema({
  key: "customTextSettings",
  schema: CustomTextSettingsSchema,
  fallback: defaultCustomTextSettings,
  migrate: (oldData, _zodIssues) => {
    const fallback = structuredClone(defaultCustomTextSettings);

    if (typeof oldData !== "object" || oldData === null) {
      return fallback;
    }
    const migratedData = fallback;
    if (
      "text" in oldData &&
      z.array(z.string()).safeParse(migratedData.text).success
    ) {
      migratedData.text = oldData["text"] as string[];
    }
    return migratedData;
  },
});

export function getText(): string[] {
  return customTextSettings.get().text;
}

export function setText(txt: string[]): void {
  const currentSettings = customTextSettings.get();
  customTextSettings.set({
    ...currentSettings,
    text: txt,
    limit: { value: txt.length, mode: currentSettings.limit.mode },
  });
}

export function getMode(): CustomTextMode {
  const currentSettings = customTextSettings.get();
  return currentSettings.mode;
}

export function setMode(val: CustomTextMode): void {
  const currentSettings = customTextSettings.get();
  customTextSettings.set({
    ...currentSettings,
    mode: val,
    limit: {
      value: currentSettings.text.length,
      mode: currentSettings.limit.mode,
    },
  });
}

export function getLimit(): CustomTextLimit {
  return customTextSettings.get().limit;
}

export function getLimitValue(): number {
  return customTextSettings.get().limit.value;
}

export function getLimitMode(): CustomTextLimitMode {
  return customTextSettings.get().limit.mode;
}

export function setLimitValue(val: number): void {
  const currentSettings = customTextSettings.get();
  customTextSettings.set({
    ...currentSettings,
    limit: { value: val, mode: currentSettings.limit.mode },
  });
}

export function setLimitMode(val: CustomTextLimitMode): void {
  const currentSettings = customTextSettings.get();
  customTextSettings.set({
    ...currentSettings,
    limit: { value: currentSettings.limit.value, mode: val },
  });
}

export function getPipeDelimiter(): boolean {
  return customTextSettings.get().pipeDelimiter;
}

export function setPipeDelimiter(val: boolean): void {
  const currentSettings = customTextSettings.get();
  customTextSettings.set({
    ...currentSettings,
    pipeDelimiter: val,
  });
}

export function getData(): CustomTextSettings {
  return customTextSettings.get();
}

/** used by books/book-session.ts to put Random's own text back */
export function setData(data: CustomTextSettings): void {
  customTextSettings.set(data);
}

export function resetToDefault(): void {
  customTextSettings.set(structuredClone(defaultCustomTextSettings));
}

// everything `long` below is the bookshelf — `books/local-books.ts` owns the
// `customTextLong` storage now (M2b), these are kept as thin wrappers so the
// existing callers (test-logic progress write-back, the modals) don't change.

export function getCustomText(name: string, long = false): string[] {
  if (long) {
    const words = LocalBooks.getBookWords(name);
    if (words === undefined) {
      throw new Error(`Custom text ${name} not found`);
    }
    return words;
  } else {
    const customText = getLocalStorage()[name];
    if (customText === undefined) {
      throw new Error(`Custom text ${name} not found`);
    }
    return customText.split(/ +/);
  }
}

export function setCustomText(
  name: string,
  text: string | string[],
  long = false,
): boolean {
  if (long) {
    return LocalBooks.addBook(name, text);
  } else {
    const customText = getLocalStorage();

    if (typeof text === "string") {
      customText[name] = text;
    } else {
      customText[name] = text.join(" ");
    }

    return setLocalStorage(customText);
  }
}

export function deleteCustomText(name: string, long: boolean): void {
  if (long) {
    LocalBooks.deleteBook(name);
    return;
  }

  const customText = getLocalStorage();

  // oxlint-disable-next-line no-dynamic-delete
  delete customText[name];

  setLocalStorage(customText);
}

export function getCustomTextLongProgress(name: string): number {
  const book = LocalBooks.getBook(name);
  if (book === undefined) throw new Error("Custom text not found");

  return book.progress;
}

/** moves the reading cursor only — what has been read lives in `book.done` */
export function setCustomTextLongProgress(
  name: string,
  progress: number,
): void {
  if (LocalBooks.getBook(name) === undefined) {
    throw new Error("Custom text not found");
  }

  LocalBooks.setCursor(name, progress);
}

/** clears the cursor *and* everything settled — the only backwards move */
export function resetCustomTextLongProgress(name: string): void {
  if (LocalBooks.getBook(name) === undefined) {
    throw new Error("Custom text not found");
  }

  LocalBooks.resetProgress(name);
}

function getLocalStorage(): CustomTextObject {
  return customTextLS.get();
}

function setLocalStorage(data: CustomTextObject): boolean {
  return customTextLS.set(data);
}

export function getCustomTextNames(long = false): string[] {
  if (long) {
    return LocalBooks.getBookNames();
  } else {
    return Object.keys(getLocalStorage());
  }
}
