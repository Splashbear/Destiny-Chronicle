import { isSrlActivity, isSrlHistoryRow, srlGroupingMode } from './srl.config';

// Real Bungie history rows for Splashbear (PSN 4611686018465122437).
const MODE_94_RACE = { activityDetails: { instanceId: '17171610050', referenceId: 3528554193, directorActivityHash: 342590048, mode: 94, modes: [5, 94] } };
const MODE_32_RACE = { activityDetails: { instanceId: '17220508230', referenceId: 1079634867, directorActivityHash: 1751043439, mode: 32, modes: [32] } };
const MODE_32_QUANTUM = { activityDetails: { instanceId: '17220682346', referenceId: 4058499058, directorActivityHash: 1751043439, mode: 32, modes: [32] } };
const PRIVATE_MATCH = { activityDetails: { instanceId: '17220669603', referenceId: 1433693863, directorActivityHash: 559852413, mode: 32, modes: [32] } };

describe('srl.config', () => {
  it('detects D2 SRL reported as mode 94', () => {
    expect(isSrlHistoryRow(MODE_94_RACE)).toBe(true);
    expect(srlGroupingMode(MODE_94_RACE, 'D2')).toBe(94);
  });

  it('detects D2 SRL races Bungie reports as mode 32 (private match)', () => {
    expect(isSrlHistoryRow(MODE_32_RACE)).toBe(true);
    expect(isSrlHistoryRow(MODE_32_QUANTUM)).toBe(true);
    expect(srlGroupingMode(MODE_32_RACE, 'D2')).toBe(94);
  });

  it('detects an unknown track from the SRL playlist director hash', () => {
    const newTrack = { activityDetails: { referenceId: 999, directorActivityHash: 1751043439, mode: 32 } };
    expect(isSrlHistoryRow(newTrack)).toBe(true);
    expect(srlGroupingMode(newTrack, 'D2')).toBe(94);
  });

  it('leaves real private matches and Sparrow Control alone', () => {
    expect(isSrlHistoryRow(PRIVATE_MATCH)).toBe(false);
    expect(srlGroupingMode(PRIVATE_MATCH, 'D2')).toBe(32);
    expect(isSrlActivity('76529701', 'Sparrow Control', 10)).toBe(false);
  });

  it('keeps D1 SRL on mode 29', () => {
    const d1 = { activityDetails: { referenceId: '1478347980', mode: 29 } };
    expect(srlGroupingMode(d1, 'D1')).toBe(29);
  });
});
