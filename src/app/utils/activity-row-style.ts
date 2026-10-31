/** CSS vars / background for activity list rows (CODE_CLEANUP_SPEC). */
export function buildActivityRowStyle(
  accent: string,
  imageUrl: string | null
): Record<string, string> {
  if (imageUrl && imageUrl.startsWith('http')) {
    return {
      '--activity-accent': accent,
      'background-image': `linear-gradient(90deg, rgba(32, 38, 44, 0.62) 0%, rgba(32, 38, 44, 0.38) 55%, rgba(32, 38, 44, 0.28) 100%), url('${imageUrl}')`,
      'background-size': 'cover',
      'background-position': 'center',
    };
  }
  return { '--activity-accent': accent };
}

export function handleActivityImageError(event: Event): void {
  const imgElement = event.target as HTMLImageElement;
  if (!imgElement.src.includes('assets/icons/activities/ghost.png')) {
    imgElement.src = 'assets/icons/activities/ghost.png';
  } else {
    imgElement.onerror = null;
  }
}
