export interface LoadingProgress {
  phase: 'fetch' | 'pgcr' | 'process' | 'render';
  current: number;  // steps completed in this phase
  total: number;    // total steps expected in this phase
  message: string;  // human friendly message for the user
} 