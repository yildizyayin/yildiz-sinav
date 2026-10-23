/**
 * S013: every institution result file says which data it holds — a frozen published version or an unpublished
 * live preview — so a preview cannot be passed around as the final result.
 */
export function reportSource(report: any): { label: string; fileSuffix: string; published: boolean } {
  const version = Number(report?.publication?.snapshotVersion || 0);
  if (report?.source === 'PUBLISHED_SNAPSHOT' && version > 0) return { label: `Yayımlanmış sonuç · sürüm ${version}`, fileSuffix: `-surum-${version}`, published: true };
  return { label: 'ÖN İZLEME — yayımlanmamış, kesin sonuç değildir', fileSuffix: '-on-izleme', published: false };
}
