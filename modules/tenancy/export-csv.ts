const csvCell = (value: unknown) => {
  let text =
    value == null
      ? ""
      : value instanceof Date
        ? value.toISOString()
        : typeof value === "object"
          ? JSON.stringify(value)
          : String(value);
  // Quoting alone does not stop spreadsheet applications evaluating a formula.
  // The JSON format preserves the original text without this presentation prefix.
  if (typeof value === "string" && (/^[\t\r\n]/.test(text) || /^\s*[=+\-@]/.test(text)))
    text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
};

export const exportCsv = (rows: readonly Record<string, unknown>[]) => {
  if (!rows.length) return "";
  const columns = Object.keys(rows[0]);
  return (
    [
      columns.map(csvCell).join(","),
      ...rows.map((row) => columns.map((column) => csvCell(row[column])).join(",")),
    ].join("\r\n") + "\r\n"
  );
};
