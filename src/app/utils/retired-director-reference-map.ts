/**
 * Retired D2 directorActivityHash → still-current referenceId.
 * BOT_DECISIONS 2026-10-30: Nightfall Ordeal playlist hashes left DestinyActivityDefinition;
 * Bungie PGCR titles resolve via referenceId. Incomplete — Splashbear scan only (11 pairs).
 */
export const RETIRED_DIRECTOR_TO_REFERENCE_ID: Readonly<Record<string, string>> = {
  '1114928259': '3849697856', // Savathûn's Song - Nightfall: The Ordeal: Adept
  '3815447166': '3849697859', // Savathûn's Song - Nightfall: The Ordeal: Hero
  '1940967975': '887176540', // The Scarlet Keep - Nightfall: The Ordeal: Adept
  '694558778': '887176543', // The Scarlet Keep - Nightfall: The Ordeal: Hero
  '2359276231': '887176537', // The Scarlet Keep - Nightfall: The Ordeal: Master
  '3407296811': '3265488360', // The Pyramidion - Nightfall: The Ordeal: Adept
  '2380555126': '3265488363', // The Pyramidion - Nightfall: The Ordeal: Hero
  '282531137': '3265488362', // The Pyramidion - Nightfall: The Ordeal: Legend
  '2357524344': '3883876605', // Strange Terrain - Nightfall: The Ordeal: Adept
  '966580527': '3883876606', // Strange Terrain - Nightfall: The Ordeal: Hero
  '4196546910': '3883876607', // Strange Terrain - Nightfall: The Ordeal: Legend
};

export function mapRetiredDirectorToReferenceId(
  directorHash: string | number | null | undefined
): string | null {
  if (directorHash == null || directorHash === '') return null;
  return RETIRED_DIRECTOR_TO_REFERENCE_ID[String(directorHash)] ?? null;
}
