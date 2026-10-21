/** One D1 record (triumph) within a record book page. */
export interface AccomplishmentD1Record {
  hash: string;
  name: string;
  description: string;
  iconPath: string;
  /** Page title within the book (from catalog or Manifest). */
  page?: string;
  complete: boolean;
  /** Progress label when known (e.g. "8 / 8"). */
  progressText?: string;
}

/** One page / section within a D1 record book. */
export interface AccomplishmentD1RecordBookPage {
  name: string;
  records: AccomplishmentD1Record[];
}

/** One D1 record book with completed-record expansion. */
export interface AccomplishmentD1RecordBook {
  hash: string;
  name: string;
  iconPath: string;
  completed: number;
  total: number;
  percentComplete: number;
  /** Flat list (completed only) for text view / snapshot. */
  completedRecords: AccomplishmentD1Record[];
  /** Pages with completed records grouped (catalog / Manifest order). */
  pages: AccomplishmentD1RecordBookPage[];
}

export interface AccountD1RecordBooksResult {
  membershipId: string;
  membershipType: number;
  fetchedAt: string;
  books: AccomplishmentD1RecordBook[];
  status: 'ok' | 'hidden' | 'empty' | 'error';
  message?: string;
}

/** Lean IDs/counts only — names/icons resolve from manifests at view time. */
export interface AccomplishmentsSnapshotAccount {
  membershipId: string;
  membershipType: number;
  game: 'D1' | 'D2';
  /** D2 medal statId → count */
  medals?: Record<string, number>;
  /** D2 badge hash → { acquired, total } */
  badges?: Record<string, { acquired: number; total: number }>;
  /** D2 owned emblem hashes */
  emblems?: string[];
  /** D2 completed seal presentation-node hashes */
  completedSeals?: string[];
  /** D1 record book hash → { completed, total } */
  d1RecordBooks?: Record<string, { completed: number; total: number }>;
  /** D1 medal statId → count */
  d1Medals?: Record<string, number>;
}

export interface AccomplishmentsSnapshot {
  savedAt: string;
  accounts: AccomplishmentsSnapshotAccount[];
}
