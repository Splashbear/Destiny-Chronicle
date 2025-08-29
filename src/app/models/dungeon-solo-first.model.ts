export interface DungeonSoloFirst {
  /** Dungeon family name (base name without version), e.g. "Prophecy" */
  family: string;
  /** Full dungeon name with version, e.g. "Prophecy: Master" */
  fullName: string;
  /** First solo completion for this specific version (playerCount = 1, completed = 1) */
  firstSolo?: import('./activity-history.model').ActivityHistory & { period: string };
  /** First solo flawless completion for this specific version (playerCount = 1, deaths = 0, completed = 1) */
  firstFlawless?: import('./activity-history.model').ActivityHistory & { period: string };
} 