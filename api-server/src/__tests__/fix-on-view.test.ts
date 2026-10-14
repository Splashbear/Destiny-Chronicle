import { FixOnViewService } from '../services/fix-on-view.service';
import { FlagLookupService } from '../services/flag-lookup.service';
import { PgcrOverrideStore } from '../services/pgcr-override.store';
import { BungieApiService, BungieApiError } from '../services/bungie-api.service';

describe('FixOnViewService', () => {
  let mockFlagLookup: jest.Mocked<FlagLookupService>;
  let mockOverrideStore: jest.Mocked<PgcrOverrideStore>;
  let mockBungieApi: jest.Mocked<BungieApiService>;
  let service: FixOnViewService;

  const mockPgcr = {
    Response: {
      period: '2025-03-16T21:43:05Z',
      activityDetails: { instanceId: '12345678901' },
      entries: [],
    },
    ErrorCode: 1,
  };

  beforeEach(() => {
    mockFlagLookup = {
      isFlagged: jest.fn(),
      isAvailable: jest.fn().mockReturnValue(true),
      getStats: jest.fn().mockReturnValue({ totalFlaggedIds: 1000 }),
    } as any;

    mockOverrideStore = {
      exists: jest.fn(),
      get: jest.fn(),
      put: jest.fn(),
      isAvailable: jest.fn().mockReturnValue(true),
      getStats: jest.fn().mockReturnValue({ totalOverrides: 100 }),
    } as any;

    mockBungieApi = {
      getBungiePgcr: jest.fn(),
    } as any;
  });

  it('should return null for non-flagged PGCRs', async () => {
    mockFlagLookup.isFlagged.mockReturnValue(false);

    service = new FixOnViewService(mockFlagLookup, mockOverrideStore, mockBungieApi);
    const result = await service.getCorrectedPgcr('12345678901', 'D2');

    expect(result).toBe(null);
    expect(mockFlagLookup.isFlagged).toHaveBeenCalledWith('12345678901', 'D2');
    expect(mockOverrideStore.get).not.toHaveBeenCalled();
  });

  it('should return existing override for flagged PGCR', async () => {
    mockFlagLookup.isFlagged.mockReturnValue(true);
    mockOverrideStore.get.mockReturnValue(mockPgcr);

    service = new FixOnViewService(mockFlagLookup, mockOverrideStore, mockBungieApi);
    const result = await service.getCorrectedPgcr('12345678901', 'D2');

    expect(result).toEqual(mockPgcr);
    expect(mockOverrideStore.get).toHaveBeenCalledWith('12345678901', 'D2');
    expect(mockBungieApi.getBungiePgcr).not.toHaveBeenCalled();

    const stats = service.getStats();
    expect(stats.flaggedRequests).toBe(1);
    expect(stats.overrideHits).toBe(1);
    expect(stats.bungieFetches).toBe(0);
  });

  it('should fetch from Bungie when override missing (with wait)', async () => {
    mockFlagLookup.isFlagged.mockReturnValue(true);
    mockOverrideStore.get.mockReturnValue(null);
    mockBungieApi.getBungiePgcr.mockResolvedValue(mockPgcr);

    service = new FixOnViewService(mockFlagLookup, mockOverrideStore, mockBungieApi, {
      firstViewWaitMs: 2000,
    });

    const result = await service.getCorrectedPgcr('12345678901', 'D2');

    expect(result).toEqual(mockPgcr);
    expect(mockBungieApi.getBungiePgcr).toHaveBeenCalledWith('12345678901', 'D2');
    expect(mockOverrideStore.put).toHaveBeenCalledWith('12345678901', 'D2', mockPgcr);

    const stats = service.getStats();
    expect(stats.bungieFetches).toBe(1);
    expect(stats.overridesSaved).toBe(1);
  });

  it('should return null on Bungie error (serve dump copy)', async () => {
    mockFlagLookup.isFlagged.mockReturnValue(true);
    mockOverrideStore.get.mockReturnValue(null);
    mockBungieApi.getBungiePgcr.mockRejectedValue(
      new BungieApiError('Privacy', 7, 'PrivacyRestriction', 403)
    );

    service = new FixOnViewService(mockFlagLookup, mockOverrideStore, mockBungieApi, {
      firstViewWaitMs: 2000,
    });

    const result = await service.getCorrectedPgcr('12345678901', 'D2');

    expect(result).toBe(null);
    expect(mockOverrideStore.put).not.toHaveBeenCalled();

    const stats = service.getStats();
    expect(stats.bungieFetches).toBe(1);
    expect(stats.bungieFetchErrors).toBe(1);
  });

  it('should use async fix when firstViewWaitMs is 0', async () => {
    mockFlagLookup.isFlagged.mockReturnValue(true);
    mockOverrideStore.get.mockReturnValue(null);
    mockBungieApi.getBungiePgcr.mockResolvedValue(mockPgcr);

    service = new FixOnViewService(mockFlagLookup, mockOverrideStore, mockBungieApi, {
      firstViewWaitMs: 0,
    });

    const result = await service.getCorrectedPgcr('12345678901', 'D2');

    // Should return null immediately (async fix triggered)
    expect(result).toBe(null);
    
    // Wait a bit for async fix to complete
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(mockBungieApi.getBungiePgcr).toHaveBeenCalledWith('12345678901', 'D2');
  });

  it('should handle timeout and trigger async retry', async () => {
    mockFlagLookup.isFlagged.mockReturnValue(true);
    mockOverrideStore.get.mockReturnValue(null);
    
    // Simulate slow Bungie response (longer than timeout)
    let slowCallStarted = false;
    mockBungieApi.getBungiePgcr.mockImplementation(
      () => {
        slowCallStarted = true;
        return new Promise((resolve) => setTimeout(() => resolve(mockPgcr), 500));
      }
    );

    service = new FixOnViewService(mockFlagLookup, mockOverrideStore, mockBungieApi, {
      firstViewWaitMs: 100, // Very short timeout
    });

    const result = await service.getCorrectedPgcr('12345678901', 'D2');

    // Should return null after timeout (fetch started but timed out)
    expect(result).toBe(null);
    expect(slowCallStarted).toBe(true);
  });

  it('should check existing overrides in batch', async () => {
    mockOverrideStore.exists.mockImplementation((id) => id === '111' || id === '333');

    service = new FixOnViewService(mockFlagLookup, mockOverrideStore, mockBungieApi);
    const existing = await service.getExistingOverrides(['111', '222', '333', '444'], 'D2');

    expect(existing).toEqual(new Set(['111', '333']));
  });

  it('should batch fix multiple PGCRs', async () => {
    mockOverrideStore.exists.mockReturnValue(false);
    mockBungieApi.getBungiePgcr.mockImplementation((iid) =>
      Promise.resolve({ ...mockPgcr, instanceId: iid })
    );

    service = new FixOnViewService(mockFlagLookup, mockOverrideStore, mockBungieApi);

    const onProgress = jest.fn();
    const failed = await service.batchFix(['111', '222', '333'], 'D2', onProgress);

    expect(failed).toEqual([]);
    expect(mockBungieApi.getBungiePgcr).toHaveBeenCalledTimes(3);
    expect(mockOverrideStore.put).toHaveBeenCalledTimes(3);
    expect(onProgress).toHaveBeenCalledWith(0, 3);
    expect(onProgress).toHaveBeenCalledWith(3, 3);
  });

  it('should skip existing overrides in batch fix', async () => {
    mockOverrideStore.exists.mockImplementation((id) => id === '222');
    mockBungieApi.getBungiePgcr.mockImplementation((iid) =>
      Promise.resolve({ ...mockPgcr, instanceId: iid })
    );

    service = new FixOnViewService(mockFlagLookup, mockOverrideStore, mockBungieApi);
    await service.batchFix(['111', '222', '333'], 'D2');

    // Should only fetch 111 and 333 (222 already exists)
    expect(mockBungieApi.getBungiePgcr).toHaveBeenCalledTimes(2);
    expect(mockBungieApi.getBungiePgcr).toHaveBeenCalledWith('111', 'D2');
    expect(mockBungieApi.getBungiePgcr).toHaveBeenCalledWith('333', 'D2');
  });

  it('should return failed IDs in batch fix', async () => {
    mockOverrideStore.exists.mockReturnValue(false);
    mockBungieApi.getBungiePgcr.mockImplementation((iid) => {
      if (iid === '222') {
        return Promise.reject(new BungieApiError('Not found', 1653, 'DestinyPGCRNotFound', 404));
      }
      return Promise.resolve({ ...mockPgcr, instanceId: iid });
    });

    service = new FixOnViewService(mockFlagLookup, mockOverrideStore, mockBungieApi);
    const failed = await service.batchFix(['111', '222', '333'], 'D2');

    expect(failed).toEqual(['222']);
    expect(mockOverrideStore.put).toHaveBeenCalledTimes(2); // Only 111 and 333
  });

  it('should report service availability', () => {
    service = new FixOnViewService(mockFlagLookup, mockOverrideStore, mockBungieApi);
    expect(service.isAvailable()).toBe(true);

    mockFlagLookup.isAvailable.mockReturnValue(false);
    expect(service.isAvailable()).toBe(false);

    mockFlagLookup.isAvailable.mockReturnValue(true);
    mockOverrideStore.isAvailable.mockReturnValue(false);
    expect(service.isAvailable()).toBe(false);
  });

  it('should track statistics', async () => {
    mockFlagLookup.isFlagged.mockReturnValue(true);
    mockOverrideStore.get
      .mockReturnValueOnce(mockPgcr) // First: override exists
      .mockReturnValueOnce(null); // Second: need to fetch
    mockBungieApi.getBungiePgcr.mockResolvedValue(mockPgcr);

    service = new FixOnViewService(mockFlagLookup, mockOverrideStore, mockBungieApi, {
      firstViewWaitMs: 2000,
    });

    await service.getCorrectedPgcr('111', 'D2');
    await service.getCorrectedPgcr('222', 'D2');

    const stats = service.getStats();
    expect(stats.flaggedRequests).toBe(2);
    expect(stats.overrideHits).toBe(1);
    expect(stats.bungieFetches).toBe(1);
    expect(stats.overridesSaved).toBe(1);
    expect(stats.bungieFetchErrors).toBe(0);
  });
});
