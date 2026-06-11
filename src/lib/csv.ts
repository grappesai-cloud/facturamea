function escapeCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  let s = String(v);
  if (s.includes('"') || s.includes(',') || s.includes('\n') || s.includes(';')) {
    s = '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

export function toCsv(rows: Record<string, unknown>[], columns?: string[]): string {
  if (rows.length === 0 && !columns) return '';
  const cols = columns ?? Object.keys(rows[0]);
  const header = cols.map(escapeCell).join(',');
  const body = rows.map((r) => cols.map((c) => escapeCell(r[c])).join(',')).join('\n');
  // BOM so Excel recognizes UTF-8
  return '﻿' + header + '\n' + body + '\n';
}

export function csvResponse(filename: string, csv: string): Response {
  return new Response(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
