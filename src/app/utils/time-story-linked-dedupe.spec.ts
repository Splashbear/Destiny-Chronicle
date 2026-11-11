import { breakdownAccountIdentity, breakdownIdentityByMembership } from './breakdown-account-identity';
import { dedupeLinkedSourceRows, preferLinkedSourceRow } from './time-story-linked-dedupe';
import { timeStorySourceSeconds, type TimeStorySourceRow } from './time-story-source';
import { buildUnifiedYearBars } from './unified-breakdown-year';

function row(partial: Partial<TimeStorySourceRow> & { instanceId: string; membershipId: string }): TimeStorySourceRow {
  return {
    period: '2023-06-01T12:00:00Z',
    game: 'D2',
    mode: 4,
    activityHash: 'raid',
    ...partial,
  };
}

describe('linked-representation dedupe', () => {
  const identity = { splash: 'D2:splashbear#1078', splashPs: 'D2:splashbear#1078', puddle: 'D2:puddlecubbs#1' };

  it('reversed linked-account order keeps the same exact totals', () => {
    const xbox = row({ instanceId: 'raid-1', membershipId: 'splash', timePlayedSeconds: 1800, characterId: 'c-xbox' });
    const steam = row({ instanceId: 'raid-1', membershipId: 'splashPs', timePlayedSeconds: 2400, characterId: 'c-steam' });
    const xboxFirst = dedupeLinkedSourceRows([xbox, steam], identity);
    const steamFirst = dedupeLinkedSourceRows([steam, xbox], identity);
    expect(xboxFirst.length).toBe(1);
    expect(steamFirst.length).toBe(1);
    expect(timeStorySourceSeconds(xboxFirst[0])).toBe(2400);
    expect(timeStorySourceSeconds(steamFirst[0])).toBe(2400);
    expect(xboxFirst[0].membershipId).toBe(steamFirst[0].membershipId);
  });

  it('prefers a verified player-time record over a longer archive duration', () => {
    const player = row({ instanceId: 'raid-1', membershipId: 'splash', timePlayedSeconds: 1800, characterId: 'c1' });
    const archive = row({ instanceId: 'raid-1', membershipId: 'splashPs', durationSeconds: 3600, characterId: 'c2' });
    const a = preferLinkedSourceRow(player, archive);
    const b = preferLinkedSourceRow(archive, player);
    expect(timeStorySourceSeconds(a)).toBe(1800);
    expect(timeStorySourceSeconds(b)).toBe(1800);
    expect(a.timePlayedSeconds).toBe(1800);
  });

  it('keeps distinct selected people in the same report separate and sums their time', () => {
    const splash = row({ instanceId: 'raid-1', membershipId: 'splash', timePlayedSeconds: 1800 });
    const puddle = row({ instanceId: 'raid-1', membershipId: 'puddle', timePlayedSeconds: 2400 });
    const rows = dedupeLinkedSourceRows([splash, puddle], identity);
    expect(rows.length).toBe(2);
    expect(rows.reduce((sum, r) => sum + timeStorySourceSeconds(r), 0)).toBe(4200);
  });

  it('does not merge distinct accounts that only share a display name', () => {
    const a = breakdownAccountIdentity({ game: 'D2', membershipId: 'mid-a', displayName: 'splashbear' });
    const b = breakdownAccountIdentity({ game: 'D2', membershipId: 'mid-b', displayName: 'splashbear' });
    expect(a).not.toBe(b);
    const identityBare = breakdownIdentityByMembership([
      { game: 'D2', membershipId: 'mid-a', displayName: 'splashbear' },
      { game: 'D2', membershipId: 'mid-b', displayName: 'splashbear' },
    ]);
    const rows = dedupeLinkedSourceRows(
      [
        row({ instanceId: 'raid-1', membershipId: 'mid-a', timePlayedSeconds: 1000 }),
        row({ instanceId: 'raid-1', membershipId: 'mid-b', timePlayedSeconds: 1000 }),
      ],
      identityBare
    );
    expect(rows.length).toBe(2);
  });

  it('keeps D1 and D2 on the same membership id separate', () => {
    const identityShared = { ps: 'D2:splashbear#1078' };
    const rows = dedupeLinkedSourceRows(
      [
        row({ instanceId: '1001', membershipId: 'ps', game: 'D2', timePlayedSeconds: 1000 }),
        row({ instanceId: '1001', membershipId: 'ps', game: 'D1', timePlayedSeconds: 500, period: '2016-06-01T12:00:00Z' }),
      ],
      identityShared
    );
    expect(rows.length).toBe(2);
    expect(rows.reduce((sum, r) => sum + timeStorySourceSeconds(r), 0)).toBe(1500);
  });

  it('still links official Bungie name#code across platforms', () => {
    const map = breakdownIdentityByMembership([
      { game: 'D2', membershipId: 'ps', bungieGlobalDisplayName: 'Splashbear', bungieGlobalDisplayNameCode: 1078 },
      { game: 'D2', membershipId: 'steam', displayName: 'Splashbear#1078' },
    ]);
    expect(map['ps']).toBe('D2:splashbear#1078');
    expect(map['ps']).toBe(map['steam']);
  });

  it('all shared views reconcile after order-independent linked dedupe', () => {
    const xbox = row({ instanceId: 'raid-1', membershipId: 'splash', timePlayedSeconds: 1800, characterId: 'c-xbox' });
    const steam = row({ instanceId: 'raid-1', membershipId: 'splashPs', timePlayedSeconds: 2400, characterId: 'c-steam' });
    const records = (order: TimeStorySourceRow[]) =>
      dedupeLinkedSourceRows(order, identity).map(r => ({
        instanceId: r.instanceId,
        period: r.period,
        game: r.game || 'D2',
        sectionKey: 'mode-4',
        sectionLabel: 'Raid',
        referenceId: 'raid',
        baseName: 'Last Wish',
        variantName: '',
        mode: 4,
        seconds: timeStorySourceSeconds(r),
        completed: true,
      }));
    const a = buildUnifiedYearBars(records([xbox, steam]), 'UTC', ['mode-4']);
    const b = buildUnifiedYearBars(records([steam, xbox]), 'UTC', ['mode-4']);
    expect(a.totalGames).toBe(1);
    expect(b.totalGames).toBe(1);
    expect(a.totalSeconds).toBe(2400);
    expect(b.totalSeconds).toBe(2400);
  });
});
