// What a file import accepts. Kept apart from the extractors so the browser can
// check a file before uploading it without bundling them.

// Vercel refuses request bodies over 4.5 MB before the app sees them, so the
// ceiling leaves room for the upload's multipart overhead.
export const importFileMaxBytes = 4 * 1024 * 1024;

export const importFileExtensions = ["pdf", "docx", "txt"] as const;

// The file picker's `accept` list.
export const importFileAccept = importFileExtensions.map((extension) => `.${extension}`).join(",");

const maxMegabytes = importFileMaxBytes / 1024 / 1024;

export const importFileDescription = `Para aproveitar um material pronto, importe o texto de um arquivo PDF, DOCX ou TXT de até ${maxMegabytes} MB.`;

// Ends every refusal of a file the owner could paste from instead.
export const pasteTextInstead = "Se preferir, copie o texto do arquivo e cole em uma nova seção.";

// The browser refuses a large file with this before uploading it, and the
// server with the same words if one gets through.
export const importFileTooLargeMessage = `O arquivo tem mais de ${maxMegabytes} MB, o tamanho máximo para importar. ${pasteTextInstead}`;

export const extensionOf = (name: string) => name.match(/\.([^.]+)$/)?.[1]?.toLowerCase() ?? "";
