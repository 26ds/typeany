/**
 * Turns an uploaded file into the plain text of a book.
 *
 * The bar for this layer is deliberately low (WORKORDER 上传格式: "提取字符就
 * 好") — get the words out, nothing else. Header/footer stripping, chapter
 * detection, page alignment and OCR for scanned PDFs are the AI pipeline's job
 * in M4.
 *
 * Every parser is behind a dynamic `import()` so someone who never uploads
 * anything never downloads pdf.js or mammoth.
 */

import type { PDFPageProxy } from "pdfjs-dist";

/** pdfjs-dist only re-exports `PDFPageProxy`, so take the shape off the method */
type TextContent = Awaited<ReturnType<PDFPageProxy["getTextContent"]>>;

export type ExtractFailureKind =
  | "unsupported-format"
  | "empty-file"
  | "too-large"
  | "corrupt-file"
  | "scanned-pdf"
  | "no-text";

/**
 * Carries which failure it was so the caller can say something specific — see
 * the user's standing rule: never a generic "import failed".
 */
export class ExtractTextError extends Error {
  public readonly kind: ExtractFailureKind;

  constructor(kind: ExtractFailureKind, message: string) {
    super(message);
    this.name = "ExtractTextError";
    this.kind = kind;
  }
}

export type ExtractedBook = {
  /** cleaned, space-separated */
  text: string;
  /** file name without the extension, for the name field */
  title: string;
};

export const SUPPORTED_EXTENSIONS = [
  "txt",
  "md",
  "markdown",
  "docx",
  "pdf",
  "epub",
] as const;

/** what the file picker offers */
export const UPLOAD_ACCEPT = ".txt,.md,.markdown,.docx,.pdf,.epub";

// pdf.js and mammoth both hold the whole file in memory; a cap keeps a stray
// 500MB file from hanging the tab instead of failing cleanly.
const MAX_FILE_BYTES = 100 * 1024 * 1024;

function getExtension(fileName: string): string {
  return fileName.split(".").pop()?.toLowerCase() ?? "";
}

function getTitle(fileName: string): string {
  const withoutExtension = fileName.replace(/\.[^.]+$/, "").trim();
  return withoutExtension === "" ? fileName : withoutExtension;
}

/**
 * Same normalisation the custom text modal applies, minus the newline
 * handling — a book always wants newlines flattened to spaces.
 */
export function cleanExtractedText(raw: string): string {
  return (
    raw
      .normalize()
      // zero-width characters are not \s, so they have to go first or they
      // end up glued inside a word
      .replace(/[\u200B-\u200D\u2060\uFEFF]/g, "")
      // \s already covers the exotic spaces (nbsp, en quad, ...) and every
      // newline, which a book always wants flattened
      .replace(/\s+/g, " ")
      .trim()
  );
}

/** strip the markup so the reader types prose, not syntax */
function stripMarkdown(raw: string): string {
  return raw
    .replace(/^---\n[\s\S]*?\n---/, "") // frontmatter
    .replace(/```[\s\S]*?```/g, " ") // fenced code
    .replace(/`([^`]*)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ") // images
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // links keep their label
    .replace(/^\s{0,3}#{1,6}\s+/gm, "") // headings
    .replace(/^\s{0,3}>\s?/gm, "") // blockquotes
    .replace(/^\s{0,3}([-*_]\s*){3,}$/gm, " ") // horizontal rules
    .replace(/^\s{0,3}[-*+]\s+/gm, "") // bullets
    .replace(/^\s{0,3}\d+\.\s+/gm, "") // ordered list markers
    .replace(/^\s*\|.*\|\s*$/gm, " ") // table rows
    .replace(/(\*\*|__|\*|_|~~)/g, "");
}

/**
 * Drains a page's text stream by hand instead of calling pdf.js's own
 * `page.getTextContent()`.
 *
 * That method is `for await (const value of readableStream)`, and Safari still
 * ships no `ReadableStream[Symbol.asyncIterator]` — verified on Safari 26.5,
 * where `ReadableStream.prototype.values` is `undefined` and every PDF upload
 * died with "undefined is not a function (near '...value of readableStream...')"
 * even though the worker had loaded and the document had opened fine.
 * `getReader()` is the same stream, minus the syntax Safari lacks.
 */
async function readPageText(page: PDFPageProxy): Promise<string> {
  const reader = (
    page.streamTextContent() as ReadableStream<TextContent>
  ).getReader();

  const parts: string[] = [];
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      for (const item of value.items) {
        if ("str" in item) parts.push(item.str);
      }
    }
  } finally {
    reader.releaseLock();
  }

  return parts.join(" ");
}

async function extractPdf(file: File): Promise<string> {
  // the legacy build, not the default one: pdf.js 6 ships modern-only code
  // (Promise.withResolvers, iterator helpers) that throws "undefined is not a
  // function" on browsers a little behind. The legacy bundle carries the
  // core-js polyfills for those — but not for the stream gap above, which is a
  // Web API and so out of core-js's reach.
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = (
    await import("pdfjs-dist/legacy/build/pdf.worker.mjs?url")
  ).default;

  const buffer = await file.arrayBuffer();

  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(buffer) });

  let doc;
  try {
    doc = await loadingTask.promise;
  } catch (e) {
    throw new ExtractTextError(
      "corrupt-file",
      `Could not open this PDF (${(e as Error).message}). If it is password protected, remove the password and try again.`,
    );
  }

  const pages: string[] = [];
  try {
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
      pages.push(await readPageText(await doc.getPage(pageNumber)));
    }
  } catch (e) {
    // naming the page beats the caller's generic "could not read <file>",
    // which is what hid the Safari stream bug for two rounds
    throw new ExtractTextError(
      "corrupt-file",
      `Could not read page ${pages.length + 1} of this PDF (${(e as Error).message}).`,
    );
  } finally {
    await loadingTask.destroy();
  }

  const text = pages.join(" ");
  if (cleanExtractedText(text) === "") {
    throw new ExtractTextError(
      "scanned-pdf",
      "This PDF has no text layer — every page is an image, so it is a scan. Reading scans needs the AI parser, which is not built yet. A text-based PDF, or an EPUB/DOCX version, will work today.",
    );
  }

  return text;
}

async function extractDocx(file: File): Promise<string> {
  const mammoth = await import("mammoth");
  const buffer = await file.arrayBuffer();

  try {
    const result = await mammoth.extractRawText({ arrayBuffer: buffer });
    return result.value;
  } catch (e) {
    throw new ExtractTextError(
      "corrupt-file",
      `Could not read this .docx (${(e as Error).message}). Old .doc files are not supported — re-save it as .docx.`,
    );
  }
}

const BLOCK_ELEMENTS =
  "p,div,br,li,tr,td,th,h1,h2,h3,h4,h5,h6,blockquote,section,article,figcaption,pre";

/**
 * An EPUB is a zip of XHTML. Reading the spine ourselves keeps us off epub.js,
 * which is a whole renderer and far more than "get the words out" needs.
 */
async function extractEpub(file: File): Promise<string> {
  const { unzipSync, strFromU8 } = await import("fflate");
  const buffer = new Uint8Array(await file.arrayBuffer());

  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(buffer);
  } catch (e) {
    throw new ExtractTextError(
      "corrupt-file",
      `Could not unpack this EPUB (${(e as Error).message}). It may be damaged, or DRM protected.`,
    );
  }

  const parser = new DOMParser();

  const containerEntry = files["META-INF/container.xml"];
  if (containerEntry === undefined) {
    throw new ExtractTextError(
      "corrupt-file",
      "This EPUB has no META-INF/container.xml, so it is not a valid EPUB.",
    );
  }

  const container = parser.parseFromString(
    strFromU8(containerEntry),
    "application/xml",
  );
  const opfPath = container
    .querySelector("rootfile")
    ?.getAttribute("full-path");
  const opfEntry = opfPath === null ? undefined : files[opfPath ?? ""];
  if (opfPath === null || opfPath === undefined || opfEntry === undefined) {
    throw new ExtractTextError(
      "corrupt-file",
      "This EPUB does not point at a content file, so its table of contents cannot be read.",
    );
  }

  const opf = parser.parseFromString(strFromU8(opfEntry), "application/xml");
  const opfDir = opfPath.includes("/")
    ? opfPath.slice(0, opfPath.lastIndexOf("/") + 1)
    : "";

  const hrefById = new Map<string, string>();
  for (const item of opf.querySelectorAll("manifest > item")) {
    const id = item.getAttribute("id");
    const href = item.getAttribute("href");
    if (id !== null && href !== null) hrefById.set(id, href);
  }

  const chapters: string[] = [];
  for (const itemref of opf.querySelectorAll("spine > itemref")) {
    const href = hrefById.get(itemref.getAttribute("idref") ?? "");
    if (href === undefined) continue;

    // hrefs are relative to the OPF and may be URL-encoded
    const entry =
      files[opfDir + href] ?? files[opfDir + decodeURIComponent(href)];
    if (entry === undefined) continue;

    const doc = parser.parseFromString(
      strFromU8(entry),
      "application/xhtml+xml",
    );

    // textContent runs adjacent blocks together ("Chapter OneThe quick…"),
    // which would weld two words into one, so end every block with a space
    for (const element of doc.querySelectorAll(BLOCK_ELEMENTS)) {
      element.append(" ");
    }

    chapters.push(doc.body?.textContent ?? "");
  }

  return chapters.join(" ");
}

export async function extractText(file: File): Promise<ExtractedBook> {
  const extension = getExtension(file.name);
  const title = getTitle(file.name);

  if (!(SUPPORTED_EXTENSIONS as readonly string[]).includes(extension)) {
    throw new ExtractTextError(
      "unsupported-format",
      `.${extension} files are not supported. Try .txt, .md, .docx, .pdf or .epub.`,
    );
  }

  if (file.size === 0) {
    throw new ExtractTextError("empty-file", "That file is empty.");
  }

  if (file.size > MAX_FILE_BYTES) {
    throw new ExtractTextError(
      "too-large",
      `That file is ${Math.round(file.size / 1024 / 1024)}MB, over the ${MAX_FILE_BYTES / 1024 / 1024}MB limit. Split it into smaller files.`,
    );
  }

  let raw: string;
  switch (extension) {
    case "pdf":
      raw = await extractPdf(file);
      break;
    case "docx":
      raw = await extractDocx(file);
      break;
    case "epub":
      raw = await extractEpub(file);
      break;
    case "md":
    case "markdown":
      raw = stripMarkdown(await file.text());
      break;
    default:
      raw = await file.text();
  }

  const text = cleanExtractedText(raw);
  if (text === "") {
    throw new ExtractTextError(
      "no-text",
      "No readable text came out of that file — it may contain only images or formatting.",
    );
  }

  return { text, title };
}
