// Escapes a value for CSV: wraps in quotes if it contains a quote, comma,
// or newline; doubles embedded quotes. Handles null/undefined as empty.
function escape(value) {
  if (value === null || value === undefined) return '';
  const str = typeof value === 'string' ? value : String(value);
  if (/[",\n\r]/.test(str)) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

export function toCsv(rows, columns) {
  const header = columns.map((col) => escape(col.header)).join(',');
  const body = rows.map((row) => columns.map((col) => escape(col.get(row))).join(',')).join('\n');
  return header + '\n' + body;
}

export function downloadCsv(filename, csvString) {
  const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
