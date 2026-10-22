/** Loading engram caption / subline (CODE_CLEANUP_SPEC). */

export function decryptingYearHint(progressMessage: string | undefined): string | null {
  const msg = progressMessage || '';
  const m = msg.match(/\b(20\d{2})\b/);
  return m ? m[1] : null;
}

export function buildDecryptingCaption(input: {
  isLoadingComplete: boolean;
  yearHint: string | null;
  profileDisplayName?: string | null;
}): string {
  if (input.isLoadingComplete) return 'Decrypted';
  if (input.yearHint) return `Decrypting ${input.yearHint}…`;
  if (input.profileDisplayName) return `Decrypting ${input.profileDisplayName}…`;
  return 'Decrypting history…';
}

export function buildDecryptingSubline(input: {
  completedCount: number;
  totalStatuses: number;
  loadingProgress: {
    current: number;
    total: number;
    message?: string;
    phase?: string;
  } | null;
}): string {
  const parts: string[] = [];
  if (input.totalStatuses > 0) {
    parts.push(`Profiles ${input.completedCount} of ${input.totalStatuses}`);
  }
  if (input.loadingProgress?.total) {
    const pct = Math.round(
      (input.loadingProgress.current / input.loadingProgress.total) * 100
    );
    parts.push(
      `${input.loadingProgress.message || input.loadingProgress.phase} · ${pct}%`
    );
  }
  return parts.join(' · ') || 'Decrypting…';
}
