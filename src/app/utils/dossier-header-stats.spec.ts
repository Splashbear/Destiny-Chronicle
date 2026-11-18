import { buildDossierHeaderStats, scopedPlatformStats } from './dossier-header-stats';

const formatSeconds = (s: number) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}h ${String(m).padStart(2, '0')}m`;
};

const cards = [
  { accountKey: 'D2|3|steam', totalTime: 377 * 3600 + 17 * 60, totalActivities: 1097, totalSeals: 5 },
  { accountKey: 'D2|1|xbox', totalTime: 659 * 3600 + 8 * 60, totalActivities: 1749, totalSeals: 10 },
  { accountKey: 'D1|1|xbox', totalTime: 2218 * 3600 + 60, totalActivities: 5223, totalSeals: 0 },
  { accountKey: 'D2|2|psn', totalTime: 6980 * 3600 + 20 * 60, totalActivities: 17674, totalSeals: 40 },
];

describe('scopedPlatformStats', () => {
  it('returns all rows when selection is empty', () => {
    expect(scopedPlatformStats(cards, []).length).toBe(4);
  });

  it('filters by canonical account keys', () => {
    const scoped = scopedPlatformStats(cards, ['D2|3|steam', 'D1|1|xbox']);
    expect(scoped.map(r => r.accountKey)).toEqual(['D2|3|steam', 'D1|1|xbox']);
  });
});

describe('buildDossierHeaderStats', () => {
  it('(a) no selection: Activities sum all cards; Active+Orbit equals played', () => {
    const active = 5000 * 3600;
    const stats = buildDossierHeaderStats({
      platformStats: cards,
      selectedAccountKeys: [],
      activeSeconds: active,
      activeDurationIncomplete: false,
      historySyncInProgress: false,
      accountStatsPending: false,
      classSeconds: { Hunter: 100, Titan: 50, Warlock: 25 },
      haveCharacters: true,
      formatSeconds,
    });
    const played = cards.reduce((s, c) => s + c.totalTime, 0);
    expect(stats.playedSeconds).toBe(played);
    expect(stats.activityCountLabel).toBe((1097 + 1749 + 5223 + 17674).toLocaleString());
    expect(stats.activeLabel).toBe(formatSeconds(active));
    expect(stats.socialLabel).toBe(formatSeconds(played - active));
    expect(stats.selectionNarrowed).toBe(false);
  });

  it('(b) Steam D2 only: Activities and seals follow that card', () => {
    const played = cards[0].totalTime;
    const active = 278 * 3600 + 42 * 60;
    const stats = buildDossierHeaderStats({
      platformStats: cards,
      selectedAccountKeys: ['D2|3|steam'],
      activeSeconds: active,
      activeDurationIncomplete: false,
      historySyncInProgress: false,
      accountStatsPending: false,
      classSeconds: { Hunter: 200, Titan: 0, Warlock: 0 },
      haveCharacters: true,
      formatSeconds,
    });
    expect(stats.activityCountLabel).toBe('1,097');
    expect(stats.sealCountLabel).toBe('5');
    expect(stats.playedSeconds).toBe(played);
    expect(stats.socialLabel).toBe(formatSeconds(played - active));
    expect(stats.selectionNarrowed).toBe(true);
    expect(stats.classTimesTitle).toContain('highlighted accounts');
  });

  it('(c) three-card selection sums card activity counts', () => {
    const keys = ['D2|3|steam', 'D2|1|xbox', 'D1|1|xbox'];
    const stats = buildDossierHeaderStats({
      platformStats: cards,
      selectedAccountKeys: keys,
      activeSeconds: 1000,
      activeDurationIncomplete: false,
      historySyncInProgress: false,
      accountStatsPending: false,
      classSeconds: { Hunter: 1, Titan: 1, Warlock: 1 },
      haveCharacters: true,
      formatSeconds,
    });
    expect(stats.activityCountLabel).toBe((1097 + 1749 + 5223).toLocaleString());
    expect(stats.playedSeconds).toBe(cards[0].totalTime + cards[1].totalTime + cards[2].totalTime);
  });

  it('(d) Orbit never goes negative', () => {
    const stats = buildDossierHeaderStats({
      platformStats: [cards[0]],
      selectedAccountKeys: ['D2|3|steam'],
      activeSeconds: cards[0].totalTime + 9999,
      activeDurationIncomplete: false,
      historySyncInProgress: false,
      accountStatsPending: false,
      classSeconds: { Hunter: 0, Titan: 0, Warlock: 0 },
      haveCharacters: true,
      formatSeconds,
    });
    expect(stats.socialLabel).toBe('0h 00m');
  });

  it('(e) history sync shows em dashes for Active / Orbit / Activities', () => {
    const stats = buildDossierHeaderStats({
      platformStats: cards,
      selectedAccountKeys: [],
      activeSeconds: 999,
      activeDurationIncomplete: false,
      historySyncInProgress: true,
      accountStatsPending: false,
      classSeconds: { Hunter: 10, Titan: 10, Warlock: 10 },
      haveCharacters: true,
      formatSeconds,
    });
    expect(stats.activeLabel).toBe('—');
    expect(stats.socialLabel).toBe('—');
    expect(stats.activityCountLabel).toBe('—');
    expect(stats.sealCountLabel).not.toBe('—');
    expect(stats.classTimes[0].label).not.toBe('—');
  });

  it('(f) incomplete D1 durations mark Active lower bound and Orbit upper bound', () => {
    const played = cards[2].totalTime;
    const active = 100 * 3600;
    const stats = buildDossierHeaderStats({
      platformStats: [cards[2]],
      selectedAccountKeys: ['D1|1|xbox'],
      activeSeconds: active,
      activeDurationIncomplete: true,
      historySyncInProgress: false,
      accountStatsPending: false,
      classSeconds: { Hunter: 1, Titan: 0, Warlock: 0 },
      haveCharacters: true,
      formatSeconds,
    });
    expect(stats.activeLabel).toBe(`≥ ${formatSeconds(active)}`);
    expect(stats.socialLabel).toBe(`≤ ${formatSeconds(played - active)}`);
    expect(stats.activeTitleExtra).toMatch(/lower bound/i);
    expect(stats.socialTitleExtra).toMatch(/Upper bound/i);
  });
});
