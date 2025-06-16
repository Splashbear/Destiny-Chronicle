export interface DungeonSoloFirst {
  /** Dungeon family name, e.g. "Prophecy" */
  family: string;
  /** First solo completion (playerCount = 1, completed = 1) */
  firstSolo?: import('./activity-history.model').ActivityHistory & { period: string };
  /** First solo flawless completion (playerCount = 1, deaths = 0, completed = 1) */
  firstFlawless?: import('./activity-history.model').ActivityHistory & { period: string };
} 