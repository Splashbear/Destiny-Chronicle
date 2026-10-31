// @ts-nocheck
/** E2E regression probe helpers (CODE_CLEANUP_SPEC). */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { buildRegressionBaseline } from '../../utils/regression-baseline';

export function installRegressionProbe(c: any): void {
  if (typeof window === 'undefined') return;
  const w = window as any;
  w.__dcRegression = {
    playedWithTop10: w.__dcRegression?.playedWithTop10 || [],
    getSnapshot: () => c.getRegressionSnapshot(),
    ready: () => c.isRegressionSnapshotReady(),
    awaitTitles: () => c.ensureTitlesForRegression(),
  };
}

export function uninstallRegressionProbe(): void {
  if (typeof window === 'undefined') return;
  delete (window as any).__dcRegression;
}

export async function ensureTitlesForRegression(c: any): Promise<void> {
  const d2 = c.selectedPlayers.filter((p) => !c.isD1Player(p));
  const loadOne = async (p: any) => {
    const key = c.getPlayerKey(p);
    if (c.playerTitles[key]?.length) return;
    delete c.playerTitles[key];
    await c.loadTitlesForPlayer(p);
  };
  await Promise.race([
    Promise.all(
      d2.map((p) =>
        loadOne(p).catch((err) => {
          console.warn(
            '[regression] loadTitlesForPlayer failed',
            p.membershipId,
            err
          );
        })
      )
    ),
    new Promise<void>((resolve) => setTimeout(resolve, 25_000)),
  ]);
  c.statsDebounce$.next();
  await new Promise((r) => setTimeout(r, 800));
}

export function isRegressionSnapshotReady(c: any): boolean {
  if (!c.selectedPlayers.length) return false;
  if (c.accountStatsPending) return false;
  if ((c.accountStats?.totalActivityCount || 0) <= 0) return false;
  return true;
}

export function getRegressionSnapshot(c: any) {
  const firsts: any[] = [];
  for (const player of c.selectedPlayers) {
    const list = c.guardianFirstsMap[c.getPlayerKey(player)] || [];
    firsts.push(...list);
  }
  const probe = (window as any).__dcRegression;

  return buildRegressionBaseline({
    label: 'splashbear-psn-puddlecubs-d1',
    capturedAt: new Date().toISOString(),
    accounts: c.selectedPlayers.map((p) => ({
      game: (p.game === 'D1' ? 'D1' : 'D2') as 'D1' | 'D2',
      membershipId: p.membershipId,
      membershipType: p.membershipType,
    })),
    activityCount: c.accountStats.totalActivityCount || 0,
    activityTimeSeconds:
      c.accountStats.totalActivityTime ?? c.accountStats.totalTime ?? 0,
    sealCount: c.accountStats.totalSeals || 0,
    firsts,
    playedWithTop10: probe?.playedWithTop10 || [],
  });
}
