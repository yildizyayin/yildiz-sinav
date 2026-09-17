export type ReportStudent = { id: string };

export function resolveReportStudentId(rows: ReportStudent[], requestedId: string | null | undefined, currentId: string | null | undefined): string {
  if (requestedId && rows.some((row) => row.id === requestedId)) return requestedId;
  if (currentId && rows.some((row) => row.id === currentId)) return currentId;
  if (rows.length === 1) return rows[0].id;
  return '';
}
