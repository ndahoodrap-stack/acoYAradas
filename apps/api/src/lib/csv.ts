export interface CsvColumn<T> {
  header: string;
  value: (row: T) => string | number | boolean | null | undefined;
}

function escape(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (/[",\n\r;]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

/** Genera un CSV compatible con Excel (separador ';' y BOM UTF-8). */
export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const header = columns.map((c) => escape(c.header)).join(';');
  const body = rows
    .map((row) => columns.map((c) => escape(c.value(row))).join(';'))
    .join('\r\n');
  return `\uFEFF${header}\r\n${body}`;
}
