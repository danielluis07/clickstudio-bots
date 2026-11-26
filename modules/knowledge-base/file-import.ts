// Turns an uploaded file into the text of a Text section. The file is read in
// memory and never stored.
import mammoth from "mammoth";
import { extractText, getDocumentProxy } from "unpdf";
import {
  extensionOf,
  importFileExtensions,
  importFileMaxBytes,
} from "@/modules/knowledge-base/import-limits";

export type UploadedFile = { name: string; bytes: Uint8Array };

// Extracted text keeps its paragraphs but not the layout's spacing, nor the
// control characters documents can carry, which Postgres text cannot hold.
const normalizeExtractedText = (text: string) =>
  text
    .replaceAll(/\r\n?/g, "\n")
    .replaceAll(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "")
    .replaceAll(/[^\S\n]+$/gm, "")
    .replaceAll(/\n{3,}/g, "\n\n")
    .trim();

// Windows Notepad saves "Unicode" as UTF-16 with a byte-order mark, and older
// files as ANSI (Windows-1252), which any byte sequence decodes as.
const decodeText = (bytes: Uint8Array) => {
  const encoding =
    bytes[0] === 0xff && bytes[1] === 0xfe
      ? "utf-16le"
      : bytes[0] === 0xfe && bytes[1] === 0xff
        ? "utf-16be"
        : null;
  if (encoding) return new TextDecoder(encoding).decode(bytes);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
};

const extractors: Record<
  (typeof importFileExtensions)[number],
  (bytes: Uint8Array) => Promise<string>
> = {
  txt: async (bytes) => {
    const text = decodeText(bytes);
    // Text files never hold NUL; a binary file renamed .txt does.
    if (text.includes("\0")) throw new Error("not a text file");
    return text;
  },
  pdf: async (bytes) => {
    // pdf.js may detach the buffer it is given, so it gets a copy.
    const pdf = await getDocumentProxy(bytes.slice(), { verbosity: 0 });
    try {
      return (await extractText(pdf, { mergePages: true })).text;
    } finally {
      // Function instances serve many requests; free the parsed document.
      await pdf.loadingTask.destroy();
    }
  },
  docx: async (bytes) => (await mammoth.extractRawText({ buffer: Buffer.from(bytes) })).value,
};

export const extractFileText = async ({ name, bytes }: UploadedFile) => {
  const extension = importFileExtensions.find((accepted) => accepted === extensionOf(name));
  if (!extension) return { ok: false as const, error: "unsupported" as const };
  if (bytes.byteLength > importFileMaxBytes)
    return { ok: false as const, error: "too_large" as const };
  let raw: string;
  try {
    raw = await extractors[extension](bytes);
  } catch {
    // Damaged, password-protected or not the type its name claims.
    return { ok: false as const, error: "unreadable" as const };
  }
  const text = normalizeExtractedText(raw);
  // A scanned PDF holds only pictures of its pages.
  if (!text) return { ok: false as const, error: "no_text" as const };
  return { ok: true as const, text };
};

// The file's name without its extension, within the title limit.
export const sectionTitleFor = (name: string, maxLength: number) =>
  [...name.replace(/\.[^.]+$/, "").trim()].slice(0, maxLength).join("").trim() ||
  "Arquivo importado";
