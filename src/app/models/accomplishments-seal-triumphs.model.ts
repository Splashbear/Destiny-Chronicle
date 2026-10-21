export interface AccomplishmentSealTriumph {
  hash: string;
  name: string;
  description: string;
  iconPath: string;
  /** From TRIUMPHS_LIST when the record appears in the triumphs tree. */
  category?: string;
  catalogOrder?: number;
}

export interface AccomplishmentCompletedSeal {
  /** Presentation node hash for the seal. */
  hash: string;
  /** Completion record hash (title unlock). */
  completionRecordHash: string;
  name: string;
  iconPath: string;
  legacy: boolean;
  triumphs: AccomplishmentSealTriumph[];
}

export interface AccountSealTriumphsResult {
  membershipId: string;
  membershipType: number;
  fetchedAt: string;
  seals: AccomplishmentCompletedSeal[];
  status: 'ok' | 'hidden' | 'empty' | 'error';
  message?: string;
}
