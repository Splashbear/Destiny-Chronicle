import {
  ACTIVITY_WRITE_CHUNK_SIZE,
  chunkedBulkAddAssignIds,
  chunkedBulkPut,
} from './chunked-table-write';

describe('chunkedBulkPut', () => {
  it('writes in chunks and yields between them', async () => {
    const calls: number[] = [];
    const table = {
      bulkPut: jasmine.createSpy('bulkPut').and.callFake(async (items: unknown[]) => {
        calls.push(items.length);
      }),
    };
    const rows = Array.from({ length: 5200 }, (_, i) => ({ id: i + 1 }));
    await chunkedBulkPut(table, rows, 2000);
    expect(calls).toEqual([2000, 2000, 1200]);
    expect(table.bulkPut).toHaveBeenCalledTimes(3);
  });

  it('no-ops on an empty list', async () => {
    const table = { bulkPut: jasmine.createSpy('bulkPut') };
    await chunkedBulkPut(table, []);
    expect(table.bulkPut).not.toHaveBeenCalled();
  });
});

describe('chunkedBulkAddAssignIds', () => {
  it('assigns returned keys onto row objects', async () => {
    const table = {
      bulkAdd: jasmine.createSpy('bulkAdd').and.callFake(async (items: { id?: number }[]) => {
        return items.map((_, i) => 100 + i);
      }),
    };
    const rows = [{}, {}, {}] as Array<{ id?: number }>;
    await chunkedBulkAddAssignIds(table, rows, ACTIVITY_WRITE_CHUNK_SIZE);
    expect(rows.map(r => r.id)).toEqual([100, 101, 102]);
    expect(table.bulkAdd).toHaveBeenCalledWith(rows, { allKeys: true });
  });
});
