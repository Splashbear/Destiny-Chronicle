import { idbReadSnapshot, noteIdbRead, resetIdbReadLog } from './idb-read-log';

describe('idb read log', () => {
  it('counts calls and rows by function', () => {
    resetIdbReadLog();
    noteIdbRead('getActivitiesByDate', 12);
    noteIdbRead('getActivitiesByDate', 4);
    noteIdbRead('heatmap.loadActivities', 3);
    expect(idbReadSnapshot()).toEqual({
      getActivitiesByDate: { calls: 2, rows: 16 },
      'heatmap.loadActivities': { calls: 1, rows: 3 },
    });
  });
});
