// Form counters and persisted text use the same normalization.
export const normalizeEntryText = (text: string) => text.replaceAll("\r\n", "\n").trim();
