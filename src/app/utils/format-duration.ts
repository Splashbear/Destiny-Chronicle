/** Formats a duration in seconds as Hh Mm (e.g. 7098h 08m). */
export function formatSecondsToHoursMinutes(
  totalSeconds: number | undefined | null
): string {
  const seconds = totalSeconds ?? 0;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${hours}h ${pad(minutes)}m`;
}
