/**
 * Stable regression snapshot for code-cleanup PRs (CODE_CLEANUP_SPEC Step 1).
 * Key accounts by game + membershipId; never by display name.
 */

export const REGRESSION_BASELINE_VERSION = 1 as const;

export interface RegressionAccountRef {
  game: 'D1' | 'D2';
  membershipId: string;
  membershipType: number;
}

export interface RegressionFirstRow {
  game: 'D1' | 'D2';
  membershipId: string;
  type: string;
  referenceId: string;
  name: string;
  /** UTC calendar day only — avoids timezone flake */
  completionDate: string;
  isSolo: boolean;
  isSoloFlawless: boolean;
}

export interface RegressionPlayedWithRow {
  membershipId: string;
  displayName: string;
  activitiesTogether: number;
}

export interface RegressionBaseline {
  version: typeof REGRESSION_BASELINE_VERSION;
  /** Human label only; equality ignores this when comparing. */
  label?: string;
  capturedAt?: string;
  accounts: RegressionAccountRef[];
  totals: {
    activityCount: number;
    activityTimeSeconds: number;
    sealCount: number;
  };
  /** Raid + dungeon firsts only (Firsts tab cards). Sorted for stable diffs. */
  firsts: RegressionFirstRow[];
  playedWithTop10: RegressionPlayedWithRow[];
}

export interface RegressionBaselineInput {
  accounts: Array<{
    game?: 'D1' | 'D2' | string;
    membershipId: string;
    membershipType: number;
  }>;
  activityCount: number;
  activityTimeSeconds: number;
  sealCount: number;
  firsts: Array<{
    game?: 'D1' | 'D2' | string;
    membershipId: string;
    type: string;
    referenceId?: string;
    name?: string;
    completionDate?: string;
    period?: string;
    isSolo?: boolean;
    isSoloFlawless?: boolean;
  }>;
  playedWithTop10?: Array<{
    membershipId: string;
    displayName?: string;
    activitiesTogether: number;
  }>;
  label?: string;
  capturedAt?: string;
}

function asGame(game: string | undefined): 'D1' | 'D2' {
  return game === 'D1' ? 'D1' : 'D2';
}

/** Normalize to YYYY-MM-DD (UTC) for stable comparison. */
export function regressionDateOnly(isoOrDate: string | undefined | null): string {
  if (!isoOrDate) return '';
  const d = new Date(isoOrDate);
  if (Number.isNaN(d.getTime())) {
    const m = String(isoOrDate).match(/^(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : String(isoOrDate).slice(0, 10);
  }
  return d.toISOString().slice(0, 10);
}

function sortAccounts(a: RegressionAccountRef, b: RegressionAccountRef): number {
  const g = a.game.localeCompare(b.game);
  if (g !== 0) return g;
  const id = a.membershipId.localeCompare(b.membershipId);
  if (id !== 0) return id;
  return a.membershipType - b.membershipType;
}

function sortFirsts(a: RegressionFirstRow, b: RegressionFirstRow): number {
  const g = a.game.localeCompare(b.game);
  if (g !== 0) return g;
  const m = a.membershipId.localeCompare(b.membershipId);
  if (m !== 0) return m;
  const t = a.type.localeCompare(b.type);
  if (t !== 0) return t;
  const r = a.referenceId.localeCompare(b.referenceId);
  if (r !== 0) return r;
  return a.completionDate.localeCompare(b.completionDate);
}

/**
 * Build a canonical baseline object suitable for JSON commit / deep equality.
 */
export function buildRegressionBaseline(input: RegressionBaselineInput): RegressionBaseline {
  const accounts = input.accounts
    .map((a) => ({
      game: asGame(a.game),
      membershipId: String(a.membershipId),
      membershipType: Number(a.membershipType) || 0
    }))
    .sort(sortAccounts);

  const firsts = input.firsts
    .filter((f) => f.type === 'raid' || f.type === 'dungeon')
    .map((f) => ({
      game: asGame(f.game),
      membershipId: String(f.membershipId),
      type: f.type,
      referenceId: String(f.referenceId || ''),
      name: String(f.name || ''),
      completionDate: regressionDateOnly(f.completionDate || f.period),
      isSolo: !!f.isSolo,
      isSoloFlawless: !!f.isSoloFlawless
    }))
    .sort(sortFirsts);

  const playedWithTop10 = (input.playedWithTop10 || [])
    .slice(0, 10)
    .map((p) => ({
      membershipId: String(p.membershipId),
      displayName: String(p.displayName || ''),
      activitiesTogether: Number(p.activitiesTogether) || 0
    }));

  return {
    version: REGRESSION_BASELINE_VERSION,
    label: input.label,
    capturedAt: input.capturedAt,
    accounts,
    totals: {
      activityCount: Number(input.activityCount) || 0,
      activityTimeSeconds: Math.round(Number(input.activityTimeSeconds) || 0),
      sealCount: Number(input.sealCount) || 0
    },
    firsts,
    playedWithTop10
  };
}

/** Strip volatile fields before equality (labels, capture time, partner display names). */
export function canonicalRegressionBaseline(b: RegressionBaseline): Omit<RegressionBaseline, 'label' | 'capturedAt'> {
  const built = buildRegressionBaseline({
    accounts: b.accounts,
    activityCount: b.totals.activityCount,
    activityTimeSeconds: b.totals.activityTimeSeconds,
    sealCount: b.totals.sealCount,
    firsts: b.firsts,
    playedWithTop10: b.playedWithTop10
  });
  return {
    version: built.version,
    accounts: built.accounts,
    totals: built.totals,
    firsts: built.firsts,
    // Names change; membershipId + activitiesTogether are the regression signal.
    playedWithTop10: built.playedWithTop10.map(({ membershipId, activitiesTogether }) => ({
      membershipId,
      displayName: '',
      activitiesTogether
    }))
  };
}

export interface RegressionDiff {
  path: string;
  expected: unknown;
  actual: unknown;
}

/** Deep-diff of two baselines (canonical form). Empty array = match. */
export function diffRegressionBaselines(
  expected: RegressionBaseline,
  actual: RegressionBaseline
): RegressionDiff[] {
  const a = canonicalRegressionBaseline(expected) as Record<string, unknown>;
  const b = canonicalRegressionBaseline(actual) as Record<string, unknown>;
  const diffs: RegressionDiff[] = [];

  function walk(exp: unknown, act: unknown, path: string): void {
    if (Array.isArray(exp) || Array.isArray(act)) {
      const ea = Array.isArray(exp) ? exp : [];
      const aa = Array.isArray(act) ? act : [];
      if (ea.length !== aa.length) {
        diffs.push({ path: `${path}.length`, expected: ea.length, actual: aa.length });
      }
      const n = Math.max(ea.length, aa.length);
      for (let i = 0; i < n; i++) {
        walk(ea[i], aa[i], `${path}[${i}]`);
      }
      return;
    }
    if (exp !== null && typeof exp === 'object' && act !== null && typeof act === 'object') {
      const ek = Object.keys(exp as object).sort();
      const ak = Object.keys(act as object).sort();
      const keys = Array.from(new Set([...ek, ...ak]));
      for (const k of keys) {
        walk((exp as Record<string, unknown>)[k], (act as Record<string, unknown>)[k], path ? `${path}.${k}` : k);
      }
      return;
    }
    if (exp !== act) {
      diffs.push({ path: path || '(root)', expected: exp, actual: act });
    }
  }

  walk(a, b, '');
  return diffs;
}

/** Canonical accounts for CODE_CLEANUP_SPEC regression. */
export const REGRESSION_FIXTURE_ACCOUNTS: RegressionAccountRef[] = [
  { game: 'D2', membershipId: '4611686018465122437', membershipType: 2 }, // Splashbear#1078 Cross Save PSN
  { game: 'D1', membershipId: '4611686018452484164', membershipType: 2 } // Puddlecubs PSN
];

export const REGRESSION_BASELINE_FILENAME = 'splashbear-psn-puddlecubs-d1.json';
