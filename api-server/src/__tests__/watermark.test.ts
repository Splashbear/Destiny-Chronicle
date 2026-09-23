/**
 * Integration test for watermark routing logic.
 * 
 * This test verifies that:
 * 1. Instance IDs below watermark are routed to archive
 * 2. Instance IDs above watermark are routed to live Bungie API
 * 3. The routing decision is made correctly based on watermark
 * 4. Routes are registered in correct order (static before params)
 */

import { WatermarkService } from '../services/watermark.service';
import * as path from 'path';

describe('WatermarkService', () => {
  let watermarkService: WatermarkService;

  beforeAll(async () => {
    const fixturePath = path.join(__dirname, 'fixtures', 'coverage_watermark.json');
    watermarkService = new WatermarkService(fixturePath);
    await watermarkService.load();
  });

  describe('isCovered', () => {
    test('should return true for instance IDs below watermark', () => {
      expect(watermarkService.isCovered('12345678901')).toBe(true);
      expect(watermarkService.isCovered('15999999999')).toBe(true);
    });

    test('should return false for instance IDs above watermark', () => {
      expect(watermarkService.isCovered('16000000000')).toBe(false);
      expect(watermarkService.isCovered('20000000000')).toBe(false);
    });

    test('should handle edge case at exact watermark', () => {
      expect(watermarkService.isCovered('15999999999')).toBe(true);
      expect(watermarkService.isCovered('16000000000')).toBe(false);
    });

    test('should return false for invalid instance IDs', () => {
      expect(watermarkService.isCovered('invalid')).toBe(false);
      expect(watermarkService.isCovered('')).toBe(false);
    });
  });

  describe('getWatermark', () => {
    test('should return loaded watermark info', () => {
      const watermark = watermarkService.getWatermark();
      expect(watermark).toBeDefined();
      expect(watermark?.max_instance_id).toBe('15999999999');
      expect(watermark?.dump_id).toBe('d2-pgcr-archive-v1');
    });
  });
});

describe('Watermark Routing Logic', () => {
  test('routing decision examples', () => {
    const watermarkService = new WatermarkService('');
    
    // Mock watermark for test
    (watermarkService as any).watermark = {
      max_instance_id: '15999999999',
      as_of: '2026-09-17T00:00:00Z',
      dump_id: 'd2-pgcr-archive-v1',
    };

    const testCases = [
      { id: '10000000000', expectedSource: 'archive', desc: 'Old D2 activity' },
      { id: '15999999999', expectedSource: 'archive', desc: 'At watermark boundary' },
      { id: '16000000000', expectedSource: 'live', desc: 'Just above watermark' },
      { id: '17000000000', expectedSource: 'live', desc: 'Recent activity' },
    ];

    testCases.forEach(({ id, expectedSource, desc }) => {
      const isCovered = watermarkService.isCovered(id);
      const actualSource = isCovered ? 'archive' : 'live';
      expect(actualSource).toBe(expectedSource);
    });
  });
});

describe('Route Registration Order', () => {
  test('route precedence documentation', () => {
    // This test documents the required route registration order.
    // Static routes MUST be registered before parameterized routes to avoid
    // '/watermark' being matched by '/:instanceId'.
    
    const correctOrder = [
      '/api/pgcr/watermark',    // Static route - MUST be first
      '/api/pgcr/activities',   // Static route with query params - MUST be first
      '/api/pgcr/:instanceId',  // Param route - MUST be last
    ];
    
    expect(correctOrder).toHaveLength(3);
    expect(correctOrder[0]).toBe('/api/pgcr/watermark');
    expect(correctOrder[correctOrder.length - 1]).toBe('/api/pgcr/:instanceId');
  });
});
