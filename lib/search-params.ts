// A page's search param as trimmed text: the first value, or "" when absent.
export const searchParamText = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
